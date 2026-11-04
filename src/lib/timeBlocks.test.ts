import { describe, expect, it } from 'vitest';
import { nextQuarterHour, timeBlocks } from './timeBlocks';

const h = (hours: number) => hours * 60;

describe('timeBlocks', () => {
  it('lays items end to end through free time, splitting one around a break', () => {
    // 12pm to 6pm with a standup from 1pm to 1:30pm.
    const free = [
      { start: h(12), end: h(13) },
      { start: h(13.5), end: h(18) },
    ];
    expect(timeBlocks(free, [{ taskId: 'a', minutes: 30 }, { taskId: 'b', minutes: 90 }, { taskId: 'c', minutes: 60 }])).toEqual([
      { taskId: 'a', ranges: [{ start: h(12), end: h(12.5) }] },
      { taskId: 'b', ranges: [{ start: h(12.5), end: h(13) }, { start: h(13.5), end: h(14.5) }] },
      { taskId: 'c', ranges: [{ start: h(14.5), end: h(15.5) }] },
    ]);
  });

  it('starts no earlier than the given time, and gives no time to what no longer fits', () => {
    const free = [{ start: h(12), end: h(18) }];
    expect(timeBlocks(free, [{ taskId: 'a', minutes: 60 }, { taskId: 'b', minutes: 120 }], h(16.25))).toEqual([
      { taskId: 'a', ranges: [{ start: h(16.25), end: h(17.25) }] },
      { taskId: 'b', ranges: [] },
    ]);
  });

  it('gives no time on a day with no free time', () => {
    expect(timeBlocks([], [{ taskId: 'a', minutes: 30 }])).toEqual([{ taskId: 'a', ranges: [] }]);
  });

  it('rounds up to the next quarter hour', () => {
    expect(nextQuarterHour(h(9) + 1)).toBe(h(9.25));
    expect(nextQuarterHour(h(9))).toBe(h(9));
  });
});
