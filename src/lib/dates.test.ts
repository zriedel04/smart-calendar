import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  isISODate,
  localToday,
  relativeDayLabel,
  startOfWeek,
  weekdayOf,
} from './dates';

describe('dates', () => {
  it('adds days across month, year and leap-day boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('is not affected by daylight saving changes', () => {
    // US clocks change on 2026-03-08 and 2026-11-01.
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
  });

  it('counts days between dates in both directions', () => {
    expect(daysBetween('2026-11-03', '2026-11-10')).toBe(7);
    expect(daysBetween('2026-11-10', '2026-11-03')).toBe(-7);
    expect(daysBetween('2026-11-03', '2026-11-03')).toBe(0);
  });

  it('knows the weekday of a date', () => {
    expect(weekdayOf('2026-11-02')).toBe(1); // Monday
    expect(weekdayOf('2026-11-08')).toBe(0); // Sunday
  });

  it('finds the Monday that starts the week', () => {
    expect(startOfWeek('2026-11-04')).toBe('2026-11-02');
    expect(startOfWeek('2026-11-02')).toBe('2026-11-02');
    expect(startOfWeek('2026-11-08')).toBe('2026-11-02');
  });

  it('validates ISO dates', () => {
    expect(isISODate('2026-11-03')).toBe(true);
    expect(isISODate('2026-02-30')).toBe(false);
    expect(isISODate('11/03/2026')).toBe(false);
    expect(isISODate(20261103)).toBe(false);
  });

  it("uses the local calendar day for today's date", () => {
    expect(localToday(new Date(2026, 10, 3, 23, 59))).toBe('2026-11-03');
    expect(localToday(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05');
  });

  it('labels nearby days in plain words', () => {
    expect(relativeDayLabel('2026-11-03', '2026-11-03')).toBe('Today');
    expect(relativeDayLabel('2026-11-04', '2026-11-03')).toBe('Tomorrow');
    expect(relativeDayLabel('2026-11-02', '2026-11-03')).toBe('Yesterday');
  });
});
