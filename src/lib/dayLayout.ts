import { MINUTES_PER_DAY, type Minutes, type TimeRange } from './time';

/** Something to draw on a day's hour timeline. */
export interface TimelineItem<T> extends TimeRange {
  item: T;
}

/** A placed item: `lane` of `lanes` side-by-side columns, for items that overlap. */
export interface PlacedItem<T> extends TimelineItem<T> {
  lane: number;
  lanes: number;
}

/**
 * Lays out a day's items in columns, the way calendar apps do: items that don't overlap anything
 * take the full width, and each group of overlapping items shares the width evenly.
 */
export function placeItems<T>(items: readonly TimelineItem<T>[]): PlacedItem<T>[] {
  const sorted = [...items].filter((i) => i.end > i.start).sort((a, b) => a.start - b.start || b.end - a.end);
  const placed: PlacedItem<T>[] = [];
  let group: PlacedItem<T>[] = [];
  let laneEnds: Minutes[] = [];
  let groupEnd = -1;

  const finishGroup = () => {
    for (const p of group) p.lanes = laneEnds.length;
    group = [];
    laneEnds = [];
  };

  for (const item of sorted) {
    if (item.start >= groupEnd) finishGroup();
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = item.end;
    const p = { ...item, lane, lanes: 1 };
    group.push(p);
    placed.push(p);
    groupEnd = Math.max(groupEnd, item.end);
  }
  finishGroup();
  return placed;
}

/**
 * The hours a day's timeline shows: whole hours from the earliest work hour or event to the latest,
 * so nothing is cut off. 8am to 6pm when the day is empty.
 */
export function timelineHours(ranges: readonly TimeRange[]): { start: Minutes; end: Minutes } {
  const all = ranges.filter((r) => r.end > r.start);
  if (all.length === 0) return { start: 8 * 60, end: 18 * 60 };
  const earliest = Math.min(...all.map((r) => r.start));
  const latest = Math.max(...all.map((r) => r.end));
  const start = Math.max(0, Math.floor(earliest / 60) * 60);
  const end = Math.min(MINUTES_PER_DAY, Math.max(start + 60, Math.ceil(latest / 60) * 60));
  return { start, end };
}
