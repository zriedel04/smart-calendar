import { describe, expect, it } from 'vitest';
import { placeItems, timelineHours } from './dayLayout';

const at = (start: number, end: number, item: string) => ({ start: start * 60, end: end * 60, item });

describe('placeItems', () => {
  it('gives items that do not overlap the full width', () => {
    const placed = placeItems([at(9, 10, 'a'), at(10, 11, 'b')]);
    expect(placed.map((p) => [p.item, p.lane, p.lanes])).toEqual([
      ['a', 0, 1],
      ['b', 0, 1],
    ]);
  });

  it('splits overlapping items into columns and reuses a free column', () => {
    const placed = placeItems([at(9, 12, 'long'), at(9, 10, 'first'), at(10, 11, 'second'), at(13, 14, 'later')]);
    const byItem = Object.fromEntries(placed.map((p) => [p.item, [p.lane, p.lanes]]));
    expect(byItem).toEqual({ long: [0, 2], first: [1, 2], second: [1, 2], later: [0, 1] });
  });

  it('puts short items one after another side by side when drawn taller than they last', () => {
    const quarter = (start: number, item: string) => ({ start, end: start + 15, item });
    const placed = placeItems([quarter(600, 'a'), quarter(615, 'b'), quarter(630, 'c')], 25);
    expect(placed.map((p) => [p.item, p.lane, p.lanes])).toEqual([
      ['a', 0, 2],
      ['b', 1, 2],
      ['c', 0, 2],
    ]);
  });

  it('leaves out items with no length', () => {
    expect(placeItems([at(9, 9, 'empty')])).toEqual([]);
  });
});

describe('timelineHours', () => {
  it('covers whole hours from the earliest to the latest time', () => {
    expect(timelineHours([{ start: 9 * 60 + 30, end: 12 * 60 }, { start: 18 * 60 + 30, end: 20 * 60 + 15 }])).toEqual({
      start: 9 * 60,
      end: 21 * 60,
    });
  });

  it('shows 8am to 6pm on an empty day', () => {
    expect(timelineHours([])).toEqual({ start: 480, end: 1080 });
  });
});
