import { describe, expect, it } from 'vitest';
import {
  formatClock,
  formatDuration,
  formatStopwatch,
  normalizeRanges,
  parseTime,
  subtractRanges,
  toTimeInputValue,
  totalMinutes,
} from './time';

const h = (hours: number) => hours * 60;

describe('time', () => {
  it('parses and formats times of day', () => {
    expect(parseTime('12:00')).toBe(720);
    expect(parseTime('09:30')).toBe(570);
    expect(parseTime('24:00')).toBe(1440);
    expect(parseTime('25:00')).toBeNull();
    expect(parseTime('noon')).toBeNull();
    expect(toTimeInputValue(570)).toBe('09:30');
    expect(toTimeInputValue(1440)).toBe('23:59');
  });

  it('formats clock times and durations for people', () => {
    expect(formatClock(h(12))).toBe('12pm');
    expect(formatClock(h(16) + 30)).toBe('4:30pm');
    expect(formatClock(0)).toBe('12am');
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(120)).toBe('2h');
    expect(formatDuration(150)).toBe('2h 30m');
    expect(formatDuration(0)).toBe('0m');
  });

  it('sorts, merges and drops invalid ranges', () => {
    expect(
      normalizeRanges([
        { start: h(14), end: h(16) },
        { start: h(9), end: h(12) },
        { start: h(11), end: h(13) },
        { start: h(17), end: h(17) },
        { start: h(16), end: h(18) },
      ]),
    ).toEqual([
      { start: h(9), end: h(13) },
      { start: h(14), end: h(18) },
    ]);
  });

  it('cuts blocked time out of working hours', () => {
    const work = [{ start: h(12), end: h(18) }];
    expect(subtractRanges(work, [{ start: h(14), end: h(15) }])).toEqual([
      { start: h(12), end: h(14) },
      { start: h(15), end: h(18) },
    ]);
    // Overlapping the edges.
    expect(subtractRanges(work, [{ start: h(11), end: h(13) }, { start: h(17), end: h(19) }])).toEqual([
      { start: h(13), end: h(17) },
    ]);
    // Covering everything, or nothing.
    expect(subtractRanges(work, [{ start: h(10), end: h(20) }])).toEqual([]);
    expect(subtractRanges(work, [{ start: h(8), end: h(9) }])).toEqual(work);
  });

  it('adds up minutes', () => {
    expect(totalMinutes([{ start: h(12), end: h(14) }, { start: h(15), end: h(16) + 30 }])).toBe(210);
  });

  it('formats a running timer', () => {
    expect(formatStopwatch(0)).toBe('0:00');
    expect(formatStopwatch(247.9)).toBe('4:07');
    expect(formatStopwatch(3765)).toBe('1:02:45');
    expect(formatStopwatch(-5)).toBe('0:00');
  });
});
