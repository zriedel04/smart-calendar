import type { Minutes, TimeRange } from './time';

export interface TimedItem {
  taskId: string;
  /** When to work on it. Usually one block; more when an event or break splits it. Empty if it doesn't fit. */
  ranges: TimeRange[];
}

/**
 * Suggests when to work on each of a day's items: they're laid end to end, in list order, through the
 * day's free time (work hours with events cut out), starting no earlier than `from`.
 * An item that doesn't fit in what's left of the day gets no time.
 */
export function timeBlocks(
  free: readonly TimeRange[],
  items: readonly { taskId: string; minutes: Minutes }[],
  from: Minutes = 0,
): TimedItem[] {
  const blocks = free.map((r) => ({ start: Math.max(r.start, from), end: r.end })).filter((r) => r.end > r.start);
  let block = 0;
  let cursor = blocks[0]?.start ?? 0;

  return items.map(({ taskId, minutes }) => {
    const left = blocks.slice(block).reduce((sum, r, i) => sum + r.end - (i === 0 ? cursor : r.start), 0);
    if (minutes <= 0 || minutes > left) return { taskId, ranges: [] };
    const ranges: TimeRange[] = [];
    let need = minutes;
    while (need > 0) {
      const current = blocks[block]!;
      const take = Math.min(need, current.end - cursor);
      ranges.push({ start: cursor, end: cursor + take });
      need -= take;
      cursor += take;
      if (cursor >= current.end && block < blocks.length - 1) {
        block++;
        cursor = blocks[block]!.start;
      }
    }
    return { taskId, ranges };
  });
}

/** Rounds a time of day up to the next quarter hour, so suggestions start on a tidy time. */
export function nextQuarterHour(minutes: Minutes): Minutes {
  return Math.ceil(minutes / 15) * 15;
}
