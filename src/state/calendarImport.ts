import type { IcsEntry } from '../lib/ics';
import { addDays, daysBetween, type ISODate } from '../lib/dates';
import type { EventDraft, TaskDraft } from './reducer';
import type { AppData } from './types';

export type ImportAs = 'task' | 'event' | 'skip';

export type SkipReason = 'past' | 'duplicate';

export interface ImportRow {
  entry: IcsEntry;
  as: ImportAs;
  /** Why the row starts out skipped, if it does. */
  skipReason?: SkipReason;
}

/** Longest stretch of days a multi-day all-day entry is copied onto. */
const MAX_SPAN_DAYS = 31;

/** True once an entry is over: an assignment past its due date, or an event past its last day. */
export function isPast(entry: IcsEntry, as: 'task' | 'event', today: ISODate): boolean {
  const end = as === 'task' ? entry.date : lastDate(entry);
  return end !== null && end < today;
}

export function lastDate(entry: IcsEntry): ISODate | null {
  // The last occurrence starts on `until`; a multi-day entry runs on past it.
  if (entry.repeat !== 'none') return entry.until ? addDays(entry.until, daysBetween(entry.date, entry.endDate)) : null;
  return entry.endDate;
}

/**
 * Decides what each calendar entry should start out as: Canvas assignments become tasks, everything
 * else becomes an event, and entries already imported or already over are skipped.
 */
export function planImport(entries: readonly IcsEntry[], data: AppData, today: ISODate): ImportRow[] {
  const imported = new Set<string>();
  for (const item of [...data.tasks, ...data.events]) if (item.sourceId) imported.add(item.sourceId);

  return entries
    .map((entry): ImportRow => {
      const as: ImportAs = entry.looksLikeAssignment ? 'task' : 'event';
      if (imported.has(entry.uid)) return { entry, as: 'skip', skipReason: 'duplicate' };
      if (isPast(entry, as, today)) return { entry, as: 'skip', skipReason: 'past' };
      return { entry, as };
    })
    .sort((a, b) => a.entry.date.localeCompare(b.entry.date) || a.entry.start - b.entry.start);
}

export function toTaskDraft(entry: IcsEntry, estimateMinutes: number): TaskDraft {
  return { title: entry.title, dueDate: entry.date, estimateMinutes, sourceId: entry.uid };
}

export function toEventDrafts(entry: IcsEntry): EventDraft[] {
  const base = { title: entry.title, repeat: entry.repeat, sourceId: entry.uid };
  const untilFor = (dayIndex: number) => (entry.until ? { until: addDays(entry.until, dayIndex) } : {});
  if (entry.allDay) {
    const kind = /birthday|\bbday\b/i.test(entry.title) ? ('birthday' as const) : ('other' as const);
    // Each day of a multi-day entry becomes its own event; a repeating one repeats every day of its span.
    const dates: ISODate[] = [];
    for (let d = entry.date; d <= entry.endDate && dates.length < MAX_SPAN_DAYS; d = addDays(d, 1)) dates.push(d);
    return dates.map((date, i) => ({ ...base, ...untilFor(i), date, start: 0, end: 24 * 60, allDay: true, blocksWork: false, kind }));
  }
  const start = entry.start;
  // A timed entry with no length still needs one to show up as a block of time.
  const end = entry.end > start ? entry.end : Math.min(start + 60, 24 * 60);
  return [{ ...base, ...untilFor(0), date: entry.date, start, end, allDay: false, blocksWork: true, kind: 'busy' }];
}
