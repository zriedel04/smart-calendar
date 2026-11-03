import type { IcsEntry } from '../lib/ics';
import { addDays, type ISODate } from '../lib/dates';
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

function lastDate(entry: IcsEntry): ISODate | null {
  if (entry.repeat !== 'none') return entry.until ?? null;
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
      const end = as === 'task' ? entry.date : lastDate(entry);
      if (end !== null && end < today) return { entry, as: 'skip', skipReason: 'past' };
      return { entry, as };
    })
    .sort((a, b) => a.entry.date.localeCompare(b.entry.date) || a.entry.start - b.entry.start);
}

export function toTaskDraft(entry: IcsEntry, estimateMinutes: number): TaskDraft {
  return { title: entry.title, dueDate: entry.date, estimateMinutes, sourceId: entry.uid };
}

export function toEventDrafts(entry: IcsEntry): EventDraft[] {
  const base = { title: entry.title, repeat: entry.repeat, sourceId: entry.uid, ...(entry.until ? { until: entry.until } : {}) };
  if (entry.allDay) {
    const kind = /birthday|\bbday\b/i.test(entry.title) ? ('birthday' as const) : ('other' as const);
    const dates: ISODate[] = [];
    for (let d = entry.date; d <= entry.endDate && dates.length < MAX_SPAN_DAYS; d = addDays(d, 1)) dates.push(d);
    if (entry.repeat !== 'none') dates.splice(1);
    return dates.map((date) => ({ ...base, date, start: 0, end: 24 * 60, allDay: true, blocksWork: false, kind }));
  }
  const start = Math.min(entry.start, 24 * 60 - 15);
  // A timed entry with no length still needs one to show up as a block of time.
  const end = entry.end > start ? entry.end : Math.min(start + 60, 24 * 60);
  return [{ ...base, date: entry.date, start, end, allDay: false, blocksWork: true, kind: 'busy' }];
}
