import { describe, expect, it } from 'vitest';
import { parseIcs } from './ics';

const calendar = (...events: string[]) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events.flatMap((e) => ['BEGIN:VEVENT', e, 'END:VEVENT']), 'END:VCALENDAR'].join(
    '\r\n',
  );

// Tests run in America/Phoenix (UTC-7, no daylight saving); see src/test/setup.ts.
describe('parseIcs', () => {
  it('reads a Canvas assignment due at a moment as an assignment in local time', () => {
    const [entry] = parseIcs(
      calendar(
        [
          'UID:event-assignment-123456',
          'SUMMARY:Lab 5 report [CHEM 101]',
          'DTSTART:20261106T065900Z',
          'DTEND:20261106T065900Z',
          'URL;VALUE=URI:https://canvas.example.edu/courses/1/assignments/123456',
        ].join('\r\n'),
      ),
    );
    expect(entry).toMatchObject({
      uid: 'event-assignment-123456',
      title: 'Lab 5 report [CHEM 101]',
      date: '2026-11-05',
      start: 23 * 60 + 59,
      allDay: false,
      looksLikeAssignment: true,
    });
  });

  it('reads all-day entries, with the exclusive end date made inclusive', () => {
    const [birthday, trip] = parseIcs(
      calendar(
        'UID:b1\r\nSUMMARY:Mom\\, birthday\r\nDTSTART;VALUE=DATE:20261112\r\nDTEND;VALUE=DATE:20261113\r\nRRULE:FREQ=YEARLY',
        'UID:t1\r\nSUMMARY:Ski trip\r\nDTSTART;VALUE=DATE:20261219\r\nDTEND;VALUE=DATE:20261222',
      ),
    );
    expect(birthday).toMatchObject({ title: 'Mom, birthday', date: '2026-11-12', endDate: '2026-11-12', allDay: true, repeat: 'yearly' });
    expect(birthday?.looksLikeAssignment).toBe(false);
    expect(trip).toMatchObject({ date: '2026-12-19', endDate: '2026-12-21' });
  });

  it('converts times from another time zone', () => {
    const [entry] = parseIcs(
      calendar('UID:x\r\nSUMMARY:Call\r\nDTSTART;TZID=America/New_York:20261105T150000\r\nDTEND;TZID=America/New_York:20261105T160000'),
    );
    // 3pm in New York is 1pm in Phoenix in November.
    expect(entry).toMatchObject({ date: '2026-11-05', start: 13 * 60, end: 14 * 60, looksLikeAssignment: false });
  });

  it('splits a Mon/Wed/Fri class into weekly entries that end with the semester', () => {
    const entries = parseIcs(
      calendar(
        'UID:c1\r\nSUMMARY:Physics\r\nDTSTART:20260824T100000\r\nDTEND:20260824T105000\r\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261211T235959Z',
      ),
    );
    expect(entries.map((e) => [e.date, e.repeat, e.until])).toEqual([
      ['2026-08-24', 'weekly', '2026-12-11'],
      ['2026-08-26', 'weekly', '2026-12-11'],
      ['2026-08-28', 'weekly', '2026-12-11'],
    ]);
    expect(entries[0]).toMatchObject({ start: 10 * 60, end: 10 * 60 + 50 });
  });

  it('unfolds long lines, skips reminders inside events, and leaves out cancelled entries', () => {
    const entries = parseIcs(
      calendar(
        'UID:long\r\nSUMMARY:A very long title that\r\n  wraps\r\nDTSTART:20261110T120000\r\nDURATION:PT1H30M\r\nBEGIN:VALARM\r\nSUMMARY:Reminder\r\nEND:VALARM',
        'UID:gone\r\nSUMMARY:Cancelled thing\r\nSTATUS:CANCELLED\r\nDTSTART:20261110T120000',
      ),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ title: 'A very long title that wraps', start: 12 * 60, end: 13 * 60 + 30 });
  });

  it('ignores text that is not a calendar', () => {
    expect(parseIcs('hello world')).toEqual([]);
  });
});
