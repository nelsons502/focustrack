import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSessionize } from './parse-sessionize.ts';
const schedule = readFileSync(new URL('./__fixtures__/schedule.md', import.meta.url), 'utf8');
const detail = readFileSync(new URL('./__fixtures__/session.md', import.meta.url), 'utf8');

describe('Sessionize real Markdown excerpts', () => {
  it('uses local ISO times, room metadata, description and speaker affiliation', () => {
    const session = parseSessionize(schedule, { '1227395': detail }).find(s => s.id === '1227395');
    expect(session).toEqual({
      id: '1227395', eventId: 'kccncna2026',
      title: 'Why We Bet the Data Platform on Kubernetes - And How AI Is Changing How We Operate It',
      description: 'Kubernetes has quietly become the default substrate for petabyte-scale data processing. Salesforce, Pinterest, Airbnb, and Apple all run native Spark, Flink, Trino, StarRocks, and Iceberg on Kubernetes at a scale the platform was never designed for.',
      speakers: [{ name: 'Vara Bonthu', company: 'AWS, Principal Technologist, OSS - Data, AI and Kubernetes' }],
      startsAt: '2026-11-10T11:30:00-07:00', endsAt: '2026-11-10T12:00:00-07:00', day: '2026-11-10',
      room: 'Salt Palace | Level 1 | 151', venue: 'Salt Palace', level: 'Level 1',
      kind: 'talk', restrictions: [], crowdEstimate: 'unknown', crowdBasis: 'unknown', captions: 'wordly-breakout',
      sourceUrl: 'https://sessionize.com/api/v2/uo948i5p/view/markdown/session/1227395',
    });
  });
  it('recognizes keynote Hall DE, community gatherings, colocated events and visible restrictions', () => {
    const sessions = parseSessionize(schedule);
    expect(sessions.find(s => s.id === '1302801')).toMatchObject({kind: 'keynote', crowdEstimate: 'large', crowdBasis: 'keynote room', captions: 'unknown'});
    expect(sessions.find(s => s.id === '1336486')).toMatchObject({kind: 'community'});
    expect(sessions.find(s => s.id === '1379082')).toMatchObject({kind: 'colocated', title: 'CNCF Maintainer Summit [SOLD OUT]', restrictions: ['sold-out']});
    expect(sessions.find(s => s.id === '1341814')).toMatchObject({kind: 'colocated', venue: null, level: null, restrictions: ['separate-registration'], captions: 'unknown'});
    expect(sessions.find(s => s.id === '1289780')).toMatchObject({kind: 'colocated', restrictions: ['all-access-pass'], crowdEstimate: 'large', crowdBasis: 'ballroom'});
  });
  it('drops registration and lunch without dropping talks about lunch or registration', () => {
    const sessions = parseSessionize(schedule);
    expect(sessions.map(s => s.id)).not.toContain('1289946');
    expect(sessions.map(s => s.id)).not.toContain('1289749');
    expect(sessions).toHaveLength(6);
  });
  it('handles midnight, noon, missing room metadata and absent descriptions', () => {
    const markdown = '### Tuesday, November 10, 2026\n- [Lunch and Learn: Registration APIs](https://sessionize.com/api/v2/uo948i5p/view/markdown/session/1)\n  12:00 am - 12:00 pm · Online';
    expect(parseSessionize(markdown)[0]).toMatchObject({startsAt:'2026-11-10T00:00:00-07:00',endsAt:'2026-11-10T12:00:00-07:00',venue:null,level:null,description:'',kind:'talk'});
  });
  it('fails clearly on malformed session metadata rather than silently losing sessions', () => {
    expect(() => parseSessionize('### Tuesday, November 10, 2026\n- [Talk](https://sessionize.com/api/v2/uo948i5p/view/markdown/session/1)\n  TBD')).toThrow(/session 1/i);
  });
});

it.each(['Coat + Bag Check', '☕ Coffee Break', 'Registration + Badge Pick-Up', '🍲 Lunch | On Own'])(
  'drops the logistics entry %s', title => {
    expect(parseSessionize(`### Tuesday, November 10, 2026\n- [${title}](https://sessionize.com/api/v2/uo948i5p/view/markdown/session/1)\n  8:00 am - 5:00 pm · Salt Palace | Level 2 | East Registration`)).toEqual([]);
  },
);
