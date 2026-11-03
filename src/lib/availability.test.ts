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
    const leap = event({ date: '2024-02-29', repeat: 'yearly', allDay: true });
    expect(eventOccursOn(leap, '2025-02-28')).toBe(true);
    expect(eventOccursOn(leap, '2028-02-29')).toBe(true);
    expect(eventOccursOn(leap, '2028-02-28')).toBe(false);
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
});
