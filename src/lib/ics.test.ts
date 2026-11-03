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

  it('ends a series after COUNT occurrences', () => {
    const [weekly] = parseIcs(calendar('UID:w\r\nSUMMARY:Workshop\r\nDTSTART:20261103T100000\r\nDTEND:20261103T110000\r\nRRULE:FREQ=WEEKLY;COUNT=2'));
    expect(weekly).toMatchObject({ repeat: 'weekly', until: '2026-11-10' });
    const mwf = parseIcs(calendar('UID:m\r\nSUMMARY:Lab\r\nDTSTART:20261102T100000\r\nDTEND:20261102T110000\r\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=4'));
    expect(mwf.map((e) => e.until)).toEqual(['2026-11-09', '2026-11-09', '2026-11-09']);
    const [yearly] = parseIcs(calendar('UID:y\r\nSUMMARY:Fair\r\nDTSTART;VALUE=DATE:20261001\r\nRRULE:FREQ=YEARLY;COUNT=3'));
    expect(yearly?.until).toBe('2028-10-01');
  });

  it('applies BYDAY in the entry\'s own time zone before converting', () => {
    // Monday 1am UTC is Sunday 6pm in Phoenix, so a weekly Monday (UTC) entry happens on Sundays here.
    const [entry] = parseIcs(calendar('UID:z\r\nSUMMARY:Call\r\nDTSTART:20261109T010000Z\r\nDTEND:20261109T020000Z\r\nRRULE:FREQ=WEEKLY;BYDAY=MO'));
    expect(entry).toMatchObject({ date: '2026-11-08', start: 18 * 60, repeat: 'weekly' });
  });

  it('follows daylight saving changes between the entry\'s zone and this one', () => {
    // 9am New York is 6am in Phoenix until Nov 1 (EDT), then 7am (EST), then 6am again from Mar 14 to Nov 7, 2027.
    const entries = parseIcs(
      calendar('UID:dst\r\nSUMMARY:Standup\r\nDTSTART;TZID=America/New_York:20261026T090000\r\nDTEND;TZID=America/New_York:20261026T100000\r\nRRULE:FREQ=WEEKLY'),
      new Date(2026, 10, 2),
    );
    expect(entries.slice(0, 3).map((e) => [e.date, e.start, e.end, e.until])).toEqual([
      ['2026-10-26', 6 * 60, 7 * 60, '2026-10-26'],
      ['2026-11-02', 7 * 60, 8 * 60, '2027-03-08'],
      ['2027-03-15', 6 * 60, 7 * 60, '2027-11-01'],
    ]);
    expect(entries[entries.length - 1]?.until).toBeUndefined();
  });

  it('keeps one date for yearly rules it cannot represent, but allows ones that restate the start', () => {
    const [thanksgiving] = parseIcs(
      calendar('UID:t\r\nSUMMARY:Thanksgiving\r\nDTSTART;VALUE=DATE:20261126\r\nRRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=4TH'),
    );
    expect(thanksgiving?.repeat).toBe('none');
    const [birthday] = parseIcs(
      calendar('UID:b\r\nSUMMARY:Sam\r\nDTSTART;VALUE=DATE:20261112\r\nRRULE:FREQ=YEARLY;BYMONTH=11;BYMONTHDAY=12'),
    );
    expect(birthday?.repeat).toBe('yearly');
  });
});
