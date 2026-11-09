import { describe, expect, it } from 'vitest';
import { DEFAULT_ENERGY_SETTINGS, EVENT_ID, QUIET_ROOM_260A } from './contract';
import type { EnergySettings, Session, Warning } from './contract';
import { checkEnergy } from './energy';

function session(id: string, start: string, end: string, extra: Partial<Session> = {}): Session {
  return {
    id, eventId: EVENT_ID, title: `Talk ${id}`, description: '', speakers: [],
    startsAt: `2026-11-10T${start}:00-07:00`, endsAt: `2026-11-10T${end}:00-07:00`,
    day: '2026-11-10', room: 'Salt Palace | Level 1 | 151', venue: 'Salt Palace',
    level: 'Level 1', roomType: 'breakout', kind: 'talk', restrictions: [],
    crowdEstimate: 'unknown', crowdBasis: 'unknown', noiseEstimate: 'unknown',
    noiseBasis: 'unknown', captions: 'unknown', sourceUrl: 'https://example.com/session',
    ...extra,
  };
}

function warnings(sessions: Session[], type: Warning['type'], settings: Partial<EnergySettings> = {}) {
  return checkEnergy(sessions, { ...DEFAULT_ENERGY_SETTINGS, ...settings }).warnings
    .filter(warning => warning.type === type);
}

describe('checkEnergy', () => {
  it('has nothing to flag or suggest for an empty plan', () => {
    expect(checkEnergy([], DEFAULT_ENERGY_SETTINGS)).toEqual({ warnings: [] });
  });

  it.each([[3, []], [2, [{ type: 'consecutive', sessionIds: ['a', 'b', 'c'], count: 3 }]]])(
    'flags only runs exceeding a maximum of %i', (maxConsecutive, expected) => {
      expect(warnings([
        session('a', '09:00', '09:30'), session('b', '09:40', '10:10'), session('c', '10:20', '10:50'),
      ], 'consecutive', { maxConsecutive })).toEqual(expected);
    },
  );

  it.each([[19, 1], [20, 0], [21, 0]])('resets a run at the minimum break boundary (%i minutes)', (gap, count) => {
    expect(warnings([
      session('a', '09:00', '09:30'), session('b', `09:${30 + gap}`, '10:30'),
    ], 'consecutive', { maxConsecutive: 1 })).toHaveLength(count);
  });

  it('reports one complete consecutive run, then starts another after a sufficient break', () => {
    expect(warnings([
      session('a', '09:00', '09:30'), session('b', '09:30', '10:00'),
      session('c', '10:00', '10:30'), session('d', '11:00', '11:30'),
    ], 'consecutive', { maxConsecutive: 1 })).toEqual([
      { type: 'consecutive', sessionIds: ['a', 'b', 'c'], count: 3 },
    ]);
  });

  it.each([
    [9, {}, 10], [10, {}, null], [14, { level: 'Level 2' }, 15],
    [15, { level: 'Level 2' }, null],
    [19, { venue: 'Other building', level: 'Level 2' }, 20],
    [20, { venue: 'Other building', level: 'Level 2' }, null],
    [14, { venue: null, level: 'Level 2' }, 15],
    [10, { venue: null, level: null }, null],
    [10, { venue: '', level: '' }, null],
  ])('uses known location changes for a %i minute gap (%j)', (gap, extra, needed) => {
    expect(warnings([
      session('a', '09:00', '09:30'), session('b', `09:${30 + gap}`, '10:30', extra),
    ], 'tight-transition')).toEqual(needed === null ? [] : [{
      type: 'tight-transition', fromId: 'a', toId: 'b', gapMinutes: gap, neededMinutes: needed,
    }]);
  });

  it('does not infer changes from missing metadata on the earlier session or from different room names', () => {
    expect(warnings([
      session('a', '09:00', '09:30', { venue: null, level: null }),
      session('b', '09:40', '10:30', { room: 'Different room' }),
    ], 'tight-transition')).toEqual([]);
  });

  it('uses the building threshold even when the level threshold is larger', () => {
    expect(warnings([
      session('a', '09:00', '09:30'),
      session('b', '09:40', '10:30', { venue: 'Other', level: 'Level 2' }),
    ], 'tight-transition', { levelChangeMinutes: 30, buildingChangeMinutes: 10 })).toEqual([]);
  });

  it('uses adjustable base transition time', () => {
    expect(warnings([session('a', '09:00', '09:30'), session('b', '09:40', '10:00')],
      'tight-transition', { transitionMinutes: 11 })).toEqual([
      { type: 'tight-transition', fromId: 'a', toId: 'b', gapMinutes: 10, neededMinutes: 11 },
    ]);
  });

  it('checks short transitions across event-local midnight', () => {
    const sessions = [session('a', '23:30', '23:59'), session('b', '00:04', '00:30', {
      startsAt: '2026-11-11T00:04:00-07:00', endsAt: '2026-11-11T00:30:00-07:00', day: '2026-11-11',
    })];
    expect(warnings(sessions, 'tight-transition')).toEqual([
      { type: 'tight-transition', fromId: 'a', toId: 'b', gapMinutes: 5, neededMinutes: 10 },
    ]);
  });

  it.each([
    [{}, {}, {}, 10],
    [{}, { level: 'Level 2' }, { level: 'Level 2' }, 15],
    [{}, { venue: 'Other', level: 'Level 2' }, { venue: 'Other', level: 'Level 2' }, 20],
    [{ venue: null, level: null }, {}, { level: 'Level 2' }, 10],
    [{}, {}, { venue: null, level: null }, 10],
    [{ venue: null }, { level: 'Level 2' }, { level: 'Level 2' }, 15],
  ])('checks transitions from the session owning the latest busy end (%j, %j, %j)', (owner, nested, next, needed) => {
    expect(warnings([
      session('a', '09:00', '12:00', owner),
      session('b', '09:30', '10:00', nested),
      session('c', '12:05', '13:00', next),
    ], 'tight-transition')).toEqual([
      { type: 'tight-transition', fromId: 'a', toId: 'c', gapMinutes: 5, neededMinutes: needed },
    ]);
  });

  it('reports overlaps without duplicated negative transitions or transitions inside a busy interval', () => {
    expect(checkEnergy([
      session('a', '09:00', '12:00'),
      session('b', '09:30', '10:00'),
      session('c', '10:05', '11:00'),
    ], DEFAULT_ENERGY_SETTINGS).warnings).toEqual([
      { type: 'overlap', sessionIds: ['a', 'b'] },
      { type: 'overlap', sessionIds: ['a', 'c'] },
    ]);
  });

  it('reports every genuine overlap, including sessions nested inside another', () => {
    expect(warnings([
      session('a', '09:00', '12:00'), session('b', '09:30', '10:00'), session('c', '10:30', '11:00'),
    ], 'overlap')).toEqual([
      { type: 'overlap', sessionIds: ['a', 'b'] }, { type: 'overlap', sessionIds: ['a', 'c'] },
    ]);
  });

  it('does not report touching endpoints or zero-length sessions as overlaps', () => {
    expect(warnings([
      session('a', '09:00', '10:00'), session('zero', '09:30', '09:30'), session('b', '10:00', '11:00'),
    ], 'overlap')).toEqual([]);
  });

  it('does not invent a break inside an enclosing talk', () => {
    expect(warnings([
      session('a', '09:00', '12:00'), session('b', '09:30', '10:00'), session('c', '10:30', '11:00'),
    ], 'consecutive', { maxConsecutive: 2 })).toEqual([
      { type: 'consecutive', sessionIds: ['a', 'b', 'c'], count: 3 },
    ]);
  });

  it.each([[5, []], [4.5, [{ type: 'long-day', hours: 5, maxHours: 4.5 }]]])(
    'uses an adjustable daily limit of %s hours', (maxDailyHours, expected) => {
      expect(warnings([session('a', '09:00', '12:00'), session('b', '13:00', '15:00')],
        'long-day', { maxDailyHours })).toEqual(expected);
    },
  );

  it('counts the union of overlapping minutes and ignores reversed durations', () => {
    expect(warnings([
      session('a', '09:00', '12:00'), session('b', '10:00', '13:00'), session('bad', '15:00', '14:00'),
    ], 'long-day', { maxDailyHours: 3 })).toEqual([{ type: 'long-day', hours: 4, maxHours: 3 }]);
  });

  it('resets consecutive sessions and daily load on each event-local day', () => {
    const next = session('b', '09:00', '12:00', {
      startsAt: '2026-11-11T09:00:00-07:00', endsAt: '2026-11-11T12:00:00-07:00', day: '2026-11-11',
    });
    const sessions = [session('a', '09:00', '12:00'), next];
    expect(warnings(sessions, 'long-day')).toEqual([]);
    expect(warnings(sessions, 'consecutive', { maxConsecutive: 1, minBreakMinutes: 1440 })).toEqual([]);
    expect(warnings(sessions, 'long-day', { maxDailyHours: 2 })).toEqual([
      { type: 'long-day', hours: 3, maxHours: 2 }, { type: 'long-day', hours: 3, maxHours: 2 },
    ]);
  });

  it('splits overnight duration at event-local midnight, even for UTC timestamps', () => {
    const overnight = session('night', '23:00', '01:00', {
      startsAt: '2026-11-11T06:00:00Z', endsAt: '2026-11-11T08:00:00Z',
    });
    expect(warnings([overnight], 'long-day', { maxDailyHours: 1 })).toEqual([]);
    expect(warnings([overnight], 'long-day', { maxDailyHours: 0.5 })).toEqual([
      { type: 'long-day', hours: 1, maxHours: 0.5 }, { type: 'long-day', hours: 1, maxHours: 0.5 },
    ]);
  });

  it('uses only the supplied noise estimate, and honors the disabled flag', () => {
    const sessions = [session('loud', '09:00', '10:00', { noiseEstimate: 'loud', noiseBasis: 'expo-floor room proxy' }),
      session('unknown', '11:00', '12:00', { roomType: 'expo-floor' })];
    expect(warnings(sessions, 'loud-room')).toEqual([{ type: 'loud-room', sessionId: 'loud' }]);
    expect(warnings(sessions, 'loud-room', { flagLoudRooms: false })).toEqual([]);
  });

  it('sorts a copy and leaves sessions and settings untouched', () => {
    const a = session('a', '09:00', '10:00');
    const b = session('b', '09:30', '10:30');
    const sessions = [b, a];
    const snapshot = structuredClone(sessions);
    sessions.forEach(Object.freeze);
    Object.freeze(sessions);
    const settings = Object.freeze({ ...DEFAULT_ENERGY_SETTINGS });
    expect(checkEnergy(sessions, settings)).toEqual(checkEnergy([a, b], settings));
    expect(warnings(sessions, 'overlap')).toEqual([{ type: 'overlap', sessionIds: ['a', 'b'] }]);
    expect(sessions).toEqual(snapshot);
  });

  it('suggests dropping a concrete overlapping session', () => {
    expect(checkEnergy([session('a', '09:00', '11:00'), session('b', '10:00', '12:00')],
      DEFAULT_ENERGY_SETTINGS).suggestion).toEqual({ kind: 'drop', sessionId: 'b', room: QUIET_ROOM_260A });
  });

  it('suggests dropping a session from an overfull run', () => {
    expect(checkEnergy([session('a', '09:00', '10:00'), session('b', '10:00', '11:00')],
      { ...DEFAULT_ENERGY_SETTINGS, maxConsecutive: 1 }).suggestion)
      .toEqual({ kind: 'drop', sessionId: 'b', room: QUIET_ROOM_260A });
  });

  it('suggests dropping from the overfull day rather than another day', () => {
    const otherDay = session('other', '09:00', '10:00', {
      startsAt: '2026-11-11T09:00:00-07:00', endsAt: '2026-11-11T10:00:00-07:00', day: '2026-11-11',
    });
    expect(checkEnergy([session('long', '09:00', '15:00'), otherDay], DEFAULT_ENERGY_SETTINGS).suggestion)
      .toEqual({ kind: 'drop', sessionId: 'long', room: QUIET_ROOM_260A });
  });

  it('suggests a quiet-room break only in a real gap of the requested length', () => {
    const sessions = [session('a', '09:00', '10:00', { noiseEstimate: 'loud' }), session('b', '10:20', '11:00')];
    expect(checkEnergy(sessions, DEFAULT_ENERGY_SETTINGS).suggestion)
      .toEqual({ kind: 'break', startsAt: sessions[0].endsAt, room: QUIET_ROOM_260A });
    expect(checkEnergy(sessions, { ...DEFAULT_ENERGY_SETTINGS, minBreakMinutes: 21 }).suggestion).toBeUndefined();
  });

  it('omits a break suggestion if there is no bounded free gap', () => {
    expect(checkEnergy([session('a', '09:00', '10:00', { noiseEstimate: 'loud' })],
      DEFAULT_ENERGY_SETTINGS).suggestion).toBeUndefined();
  });

  it('does not suggest an unrelated break before the warned day', () => {
    const loud = session('loud', '09:00', '10:00', {
      startsAt: '2026-11-11T09:00:00-07:00', endsAt: '2026-11-11T10:00:00-07:00',
      day: '2026-11-11', noiseEstimate: 'loud',
    });
    expect(checkEnergy([session('a', '09:00', '10:00'), session('b', '11:00', '12:00'), loud],
      DEFAULT_ENERGY_SETTINGS).suggestion).toBeUndefined();
  });

  it('does not suggest an unrelated break after the warned day', () => {
    const loud = session('loud', '09:00', '10:00', { noiseEstimate: 'loud' });
    const nextDay = [
      session('a', '09:00', '10:00', {
        startsAt: '2026-11-11T09:00:00-07:00', endsAt: '2026-11-11T10:00:00-07:00', day: '2026-11-11',
      }),
      session('b', '11:00', '12:00', {
        startsAt: '2026-11-11T11:00:00-07:00', endsAt: '2026-11-11T12:00:00-07:00', day: '2026-11-11',
      }),
    ];
    expect(checkEnergy([loud, ...nextDay], DEFAULT_ENERGY_SETTINGS).suggestion).toBeUndefined();
  });
});
