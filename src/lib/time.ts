/** Minutes since midnight (0 to 1440), or a duration in minutes. */
export type Minutes = number;

/** A block of time within a day, from `start` (inclusive) to `end` (exclusive). */
export interface TimeRange {
  start: Minutes;
  end: Minutes;
}

export const MINUTES_PER_DAY = 1440;

/** Parses "HH:MM" (24h, as produced by `<input type="time">`) into minutes since midnight. */
export function parseTime(value: string): Minutes | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59 || (hours === 24 && minutes > 0)) return null;
  return hours * 60 + minutes;
}

/** Formats minutes since midnight as "HH:MM" for `<input type="time">`. */
export function toTimeInputValue(minutes: Minutes): string {
  const clamped = Math.min(Math.max(minutes, 0), MINUTES_PER_DAY - 1);
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Formats minutes since midnight for people, e.g. "12pm", "4:30pm". */
export function formatClock(minutes: Minutes): string {
  const total = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const suffix = h24 < 12 ? 'am' : 'pm';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`;
}

export function formatRange(range: TimeRange): string {
  return `${formatClock(range.start)} – ${formatClock(range.end)}`;
}

/** Formats a duration, e.g. "45m", "2h", "2h 30m". */
export function formatDuration(minutes: Minutes): string {
  const rounded = Math.round(minutes);
  if (rounded <= 0) return '0m';
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** A running timer's reading, such as "4:07" or "1:02:45". */
export function formatStopwatch(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** Drops empty or invalid ranges, sorts them, and merges any that overlap or touch. */
export function normalizeRanges(ranges: readonly TimeRange[]): TimeRange[] {
  const valid = ranges
    .map((r) => ({
      start: Math.max(0, Math.min(r.start, MINUTES_PER_DAY)),
      end: Math.max(0, Math.min(r.end, MINUTES_PER_DAY)),
    }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start);

  const merged: TimeRange[] = [];
  for (const range of valid) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

/** Returns the parts of `base` that are not covered by any range in `cut`. */
export function subtractRanges(base: readonly TimeRange[], cut: readonly TimeRange[]): TimeRange[] {
  const cuts = normalizeRanges(cut);
  const result: TimeRange[] = [];

  for (const range of normalizeRanges(base)) {
    let cursor = range.start;
    for (const c of cuts) {
      if (c.end <= cursor || c.start >= range.end) continue;
      if (c.start > cursor) result.push({ start: cursor, end: c.start });
      cursor = Math.max(cursor, c.end);
      if (cursor >= range.end) break;
    }
    if (cursor < range.end) result.push({ start: cursor, end: range.end });
  }
  return result;
}

export function totalMinutes(ranges: readonly TimeRange[]): Minutes {
  return ranges.reduce((sum, r) => sum + Math.max(0, r.end - r.start), 0);
}
