import { describe, expect, it } from 'vitest';
import {
  capacityOn,
  eventOccursOn,
  freeHoursOn,
  workingHoursOn,
  type AvailabilityRules,
  type CalendarEvent,
} from './availability';

const h = (hours: number) => hours * 60;
const noonToSix = [{ start: h(12), end: h(18) }];

const rules = (overrides: Partial<AvailabilityRules> = {}): AvailabilityRules => ({
  weeklyHours: [[], noonToSix, noonToSix, noonToSix, noonToSix, noonToSix, []],
  overrides: {},
  events: [],
  ...overrides,
});

const event = (partial: Partial<CalendarEvent>): CalendarEvent => ({
  id: 'e1',
  title: 'Class',
  date: '2026-11-03',
  start: h(14),
  end: h(15),
  repeat: 'none',
  ...partial,
});

describe('finer repeats and events over several days', () => {
  const on = (e: CalendarEvent, dates: string[]) => dates.filter((d) => eventOccursOn(e, d));

  it('repeats every day, on weekdays, and every other week', () => {
    // Nov 3, 2026 is a Tuesday.
    const week = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-07', '2026-11-08', '2026-11-09'];
    expect(on(event({ repeat: 'weekly', rule: 'daily' }), week)).toEqual(week.slice(1));
    expect(on(event({ repeat: 'weekly', rule: 'weekdays' }), week)).toEqual(['2026-11-03', '2026-11-04', '2026-11-09']);
    expect(on(event({ repeat: 'weekly', rule: 'biweekly' }), ['2026-11-03', '2026-11-10', '2026-11-17', '2026-12-01'])).toEqual([
      '2026-11-03',
      '2026-11-17',
      '2026-12-01',
    ]);
  });

  it('repeats on the same weekday of each month, with a 5th one meaning the last', () => {
    // Nov 19, 2026 is the 3rd Thursday; Dec's 3rd Thursday is the 17th.
    const third = event({ date: '2026-11-19', repeat: 'monthly', rule: 'monthlyWeekday' });
    expect(on(third, ['2026-12-10', '2026-12-17', '2026-12-19', '2027-01-21'])).toEqual(['2026-12-17', '2027-01-21']);
    // Oct 29, 2026 is a 5th Thursday: November has four, so it lands on the last one, the 26th.
    const last = event({ date: '2026-10-29', repeat: 'monthly', rule: 'monthlyWeekday' });
    expect(on(last, ['2026-11-19', '2026-11-26', '2026-12-31'])).toEqual(['2026-11-26', '2026-12-31']);
  });

  it('reads an unknown rule as the plain repeat beside it', () => {
    expect(eventOccursOn(event({ repeat: 'weekly', rule: 'hourly' as never }), '2026-11-10')).toBe(true);
    expect(eventOccursOn(event({ repeat: 'weekly', rule: 'hourly' as never }), '2026-11-04')).toBe(false);
  });

  it('runs an all-day event through its last day, and each repeat as long', () => {
    const trip = event({ date: '2026-11-06', endDate: '2026-11-08', allDay: true, blocksWork: true });
    expect(on(trip, ['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09'])).toEqual(['2026-11-06', '2026-11-07', '2026-11-08']);
    expect(freeHoursOn(rules({ events: [trip] }), '2026-11-07')).toEqual([]);

    const yearly = { ...trip, repeat: 'yearly' as const };
    expect(on(yearly, ['2027-11-05', '2027-11-07', '2027-11-08', '2027-11-09'])).toEqual(['2027-11-07', '2027-11-08']);
    // A last day only counts for all-day events.
    expect(eventOccursOn(event({ endDate: '2026-11-05' }), '2026-11-04')).toBe(false);
  });
});

describe('availability', () => {
  it('uses the weekday default when there is no override', () => {
    expect(workingHoursOn(rules(), '2026-11-02')).toEqual(noonToSix); // Monday
    expect(workingHoursOn(rules(), '2026-11-08')).toEqual([]); // Sunday
    expect(capacityOn(rules(), '2026-11-02')).toBe(h(6));
  });

  it('changes one Monday without touching the other Mondays', () => {
    const r = rules({ overrides: { '2026-11-09': [{ start: h(12), end: h(16) }] } });
    expect(capacityOn(r, '2026-11-02')).toBe(h(6));
    expect(capacityOn(r, '2026-11-09')).toBe(h(4));
    expect(capacityOn(r, '2026-11-16')).toBe(h(6));
  });

  it('treats an empty override as a day off', () => {
    const r = rules({ overrides: { '2026-11-04': [] } });
    expect(capacityOn(r, '2026-11-04')).toBe(0);
  });

  it('subtracts fixed events from working hours', () => {
    const r = rules({ events: [event({})] });
    expect(freeHoursOn(r, '2026-11-03')).toEqual([
      { start: h(12), end: h(14) },
      { start: h(15), end: h(18) },
    ]);
    expect(capacityOn(r, '2026-11-03')).toBe(h(5));
    // A one-time event doesn't affect other days.
    expect(capacityOn(r, '2026-11-10')).toBe(h(6));
  });

  it('repeats weekly events on the same weekday, starting from their first date', () => {
    const weekly = event({ repeat: 'weekly' });
    expect(eventOccursOn(weekly, '2026-11-03')).toBe(true);
    expect(eventOccursOn(weekly, '2026-11-10')).toBe(true);
    expect(eventOccursOn(weekly, '2026-11-04')).toBe(false);
    expect(eventOccursOn(weekly, '2026-10-27')).toBe(false);
    expect(capacityOn(rules({ events: [weekly] }), '2026-11-17')).toBe(h(5));
  });

  it('ignores events outside working hours', () => {
    const r = rules({ events: [event({ start: h(8), end: h(9) })] });
    expect(capacityOn(r, '2026-11-03')).toBe(h(6));
  });

  it('repeats yearly events on the same date each year', () => {
    const birthday = event({ date: '2025-03-14', repeat: 'yearly', allDay: true, kind: 'birthday' });
    expect(eventOccursOn(birthday, '2026-03-14')).toBe(true);
    expect(eventOccursOn(birthday, '2026-03-15')).toBe(false);
    expect(eventOccursOn(birthday, '2024-03-14')).toBe(false);
  });

  it('moves a Feb 29 birthday to Feb 28 outside leap years', () => {
    const leap = event({ date: '2024-02-29', repeat: 'yearly', allDay: true, kind: 'birthday' });
    expect(eventOccursOn(leap, '2025-02-28')).toBe(true);
    expect(eventOccursOn(leap, '2028-02-29')).toBe(true);
    expect(eventOccursOn(leap, '2028-02-28')).toBe(false);
  });

  it('keeps other Feb 29 yearly events to leap years', () => {
    const party = event({ date: '2024-02-29', repeat: 'yearly', allDay: true, kind: 'other' });
    expect(eventOccursOn(party, '2025-02-28')).toBe(false);
    expect(eventOccursOn(party, '2028-02-29')).toBe(true);
  });

  it('does not take all-day events out of work hours unless asked to', () => {
    const birthday = event({ date: '2026-11-03', allDay: true, kind: 'birthday' });
    expect(capacityOn(rules({ events: [birthday] }), '2026-11-03')).toBe(h(6));
    const trip = event({ date: '2026-11-03', allDay: true, kind: 'plan', blocksWork: true });
    expect(capacityOn(rules({ events: [trip] }), '2026-11-03')).toBe(0);
  });

  it('lets a timed plan leave work hours alone', () => {
    const lunch = event({ kind: 'plan', start: h(12), end: h(13), blocksWork: false });
    expect(capacityOn(rules({ events: [lunch] }), '2026-11-03')).toBe(h(6));
    expect(capacityOn(rules({ events: [{ ...lunch, blocksWork: true }] }), '2026-11-03')).toBe(h(5));
  });

  it('stops a repeating event after its last date', () => {
    const lecture = event({ date: '2026-11-03', repeat: 'weekly', until: '2026-11-17' });
    expect(eventOccursOn(lecture, '2026-11-17')).toBe(true);
    expect(eventOccursOn(lecture, '2026-11-24')).toBe(false);
  });

  it('repeats monthly on the same day, or the last day of shorter months', () => {
    const rent = event({ date: '2026-01-31', repeat: 'monthly', allDay: true });
    expect(eventOccursOn(rent, '2026-02-28')).toBe(true);
    expect(eventOccursOn(rent, '2026-03-31')).toBe(true);
    expect(eventOccursOn(rent, '2026-03-30')).toBe(false);
    expect(eventOccursOn(rent, '2026-04-30')).toBe(true);
    const club = event({ date: '2026-11-15', repeat: 'monthly' });
    expect(eventOccursOn(club, '2026-12-15')).toBe(true);
    expect(eventOccursOn(club, '2026-12-16')).toBe(false);
    expect(eventOccursOn(club, '2026-10-15')).toBe(false);
  });
});
