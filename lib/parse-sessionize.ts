import { EVENT_ID, EVENT_UTC_OFFSET, type RoomType, type Session, type SessionKind } from './contract.ts';

const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const unescape = (value: string) => value.replace(/\\([\\[\]()*_`])/g, '$1');

function timestamp(day: string, clock: string, offset: string): string {
  const match = /^(\d{1,2}):(\d{2}) ([ap]m)$/i.exec(clock);
  if (!match || +match[1] < 1 || +match[1] > 12 || +match[2] > 59) throw new Error('Invalid session time');
  if (!/^[+-]\d{2}:\d{2}$/.test(offset)) throw new Error('Invalid event UTC offset');
  const hour = +match[1] % 12 + (match[3].toLowerCase() === 'pm' ? 12 : 0);
  return `${day}T${String(hour).padStart(2, '0')}:${match[2]}:00${offset}`;
}

function classify(title: string, room: string, day: string, durationMinutes: number): SessionKind {
  const plain = title.replace(/^[^\p{L}\p{N}]+/u, '');
  if (/^(registration\s*\+|coat\s*\+\s*bag check|coffee break\b|lunch(?:\s*\||$)|breakfast(?:\s*\||$))/i.test(plain)) return 'logistics';
  if (/keynote/i.test(title) || /\| Hall DE$/i.test(room)) return 'keynote';
  if (day < '2026-11-10' && /summit|hosted by|day with|separate registration|full day event|half day event/i.test(title)) return 'colocated';
  if (/separate registration|all access pass/i.test(title)) return 'colocated';
  if (/community gathering|network nook|peer group mentoring|meetup|meet \+ greet|\bBoF\b|documentary/i.test(title)) return 'community';
  if (/^Demo Theater:/i.test(title)) return 'demo';
  if (/tutorial|contribfest/i.test(title)) return 'workshop';
  if (/showcase|pavilion|in-booth/i.test(title)) return 'community';
  if (durationMinutes <= 10) return 'lightning';
  if (durationMinutes >= 75) return 'workshop';
  if (/panel/i.test(title)) return 'panel';
  return 'talk';
}

function section(markdown: string, heading: string): string {
  return markdown.replace(/\r/g, '').split(/^## /m)
    .find(part => part.startsWith(`${heading}\n`))?.slice(heading.length).trim() ?? '';
}

export function parseSessionize(markdown: string, details: Record<string, string> = {}, offset: string = EVENT_UTC_OFFSET): Session[] {
  const sessions: Session[] = [];
  const lines = markdown.replace(/\r/g, '').split('\n');
  let day = '';
  for (let i = 0; i < lines.length; i++) {
    const heading = /^### \w+, (\w+) (\d{1,2}), (\d{4})$/.exec(lines[i]);
    if (heading) {
      const month = months.indexOf(heading[1]) + 1;
      if (!month) throw new Error('Invalid schedule date');
      day = `${heading[3]}-${String(month).padStart(2, '0')}-${heading[2].padStart(2, '0')}`;
    }
    const link = /^- \[(.*)\]\((https:\/\/sessionize\.com\/api\/v2\/[^/]+\/view\/markdown\/session\/(\d+))\)$/.exec(lines[i]);
    if (!link) continue;
    const [, rawTitle, sourceUrl, id] = link;
    const metadata = /^(?:(.*?) · )?(\d{1,2}:\d{2} [ap]m) - (\d{1,2}:\d{2} [ap]m) · (.+)$/i.exec((lines[i + 1] ?? '').trim());
    if (!day || !metadata) throw new Error(`Invalid metadata for session ${id}`);
    const [, names, start, end, room] = metadata;
    const title = unescape(rawTitle);
    const roomParts = room.split(' | ');
    const venue = roomParts.length > 1 ? roomParts[0] : null;
    const level = roomParts.find(part => /^Level\s/i.test(part)) ?? null;
    const restrictions: Session['restrictions'] = [];
    if (/sold out/i.test(title)) restrictions.push('sold-out');
    if (/separate registration/i.test(title)) restrictions.push('separate-registration');
    if (/all access pass/i.test(title)) restrictions.push('all-access-pass');
    const detail = details[id] ?? '';
    const speakerSection = section(detail, 'Speakers') || section(detail, 'Speaker');
    const speakers = [...speakerSection.matchAll(/^- \[(.*?)\]\([^\n]+?\)(?: — (.*))?$/gm)].map(match => ({
      name: unescape(match[1]), company: unescape(match[2] ?? ''),
    }));
    const ballroom = /ballroom/i.test(room) && !/\bfoyer\b/i.test(room);
    const breakout = venue === 'Salt Palace' && level !== null && /^(?:\d{3}\b|Grand Ballroom)/i.test(roomParts[2] ?? '');
    const startsAt = timestamp(day, start, offset);
    let endsAt = timestamp(day, end, offset);
    if (endsAt <= startsAt) {
      const nextDay = new Date(`${day}T00:00:00Z`);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      endsAt = timestamp(nextDay.toISOString().slice(0, 10), end, offset);
    }
    const kind = classify(title, room, day, (Date.parse(endsAt) - Date.parse(startsAt)) / 60_000);
    if (kind === 'logistics') continue;
    const roomName = roomParts.at(-1) ?? room;
    const roomType: RoomType = ballroom ? 'ballroom'
      : /solutions showcase|exhibit hall/i.test(room) ? 'expo-floor'
      : /^\d+\b/.test(roomName) ? 'breakout' : 'other';
    const combined = roomType === 'breakout' && /^\d+\s*[A-Z]\s*[-–]\s*[A-Z]\b/i.test(roomName);
    sessions.push({
      id, eventId: EVENT_ID, title, description: section(detail, 'Description'),
      speakers: speakers.length ? speakers : names ? names.split(', ').map(name => ({name: unescape(name), company: ''})) : [],
      startsAt, endsAt, day, room, venue, level, roomType, kind, restrictions,
      crowdEstimate: ballroom ? 'large' : combined ? 'moderate' : 'unknown',
      crowdBasis: ballroom ? 'ballroom' : combined ? 'combined numbered breakout room' : 'unknown',
      noiseEstimate: roomType === 'expo-floor' ? 'loud' : 'unknown',
      noiseBasis: roomType === 'expo-floor' ? 'expo-floor room proxy' : 'unknown',
      captions: breakout ? 'wordly-breakout' : 'unknown', sourceUrl,
    });
  }
  const keynoteRooms = new Set(sessions.filter(session => session.kind === 'keynote').map(session => session.room));
  return sessions.map(session => keynoteRooms.has(session.room) ? {
    ...session, roomType: 'keynote-hall', crowdEstimate: 'large', crowdBasis: 'keynote room',
    noiseEstimate: 'unknown', noiseBasis: 'unknown',
  } : session);
}
