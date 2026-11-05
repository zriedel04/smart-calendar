import { describe, expect, it } from 'vitest';
import { easterSunday, holidaysInYear, holidaysOn } from './holidays';

describe('holidays', () => {
  it('puts the moving holidays on the right days', () => {
    const on = (name: string, year: number) => holidaysInYear(year).find((h) => h.name === name)?.date;
    expect(on('Martin Luther King Jr. Day', 2026)).toBe('2026-01-19');
    expect(on("Presidents' Day", 2026)).toBe('2026-02-16');
    expect(on('Memorial Day', 2026)).toBe('2026-05-25');
    expect(on('Labor Day', 2026)).toBe('2026-09-07');
    expect(on("Columbus / Indigenous Peoples' Day", 2026)).toBe('2026-10-12');
    expect(on('Thanksgiving', 2026)).toBe('2026-11-26');
    expect(on('Thanksgiving', 2027)).toBe('2027-11-25');
    expect(on("Mother's Day", 2026)).toBe('2026-05-10');
    expect(on("Father's Day", 2026)).toBe('2026-06-21');
    // May 2027 has five Mondays; Memorial Day is the last.
    expect(on('Memorial Day', 2027)).toBe('2027-05-31');
  });

  it('works out Easter', () => {
    expect(easterSunday(2024)).toBe('2024-03-31');
    expect(easterSunday(2025)).toBe('2025-04-20');
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2027)).toBe('2027-03-28');
    expect(easterSunday(2038)).toBe('2038-04-25');
  });

  it('finds the holidays on a date, and marks federal ones', () => {
    expect(holidaysOn('2026-07-04')).toEqual([{ date: '2026-07-04', name: 'Independence Day', federal: true }]);
    expect(holidaysOn('2026-10-31')).toEqual([{ date: '2026-10-31', name: 'Halloween', federal: false }]);
    expect(holidaysOn('2026-07-05')).toEqual([]);
  });

  it('lists every federal holiday once a year', () => {
    expect(holidaysInYear(2026).filter((h) => h.federal)).toHaveLength(11);
  });
});
