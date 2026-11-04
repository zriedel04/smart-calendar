import { addDays, weekdayOf, WEEKDAY_NAMES, type ISODate, type Weekday } from '../lib/dates';
import { loggedMinutesByTask, isTaskComplete } from './planner';
import type { AppData, Task, TaskSeries } from './types';

/** How many days ahead, counting today, each repeating task gets its copies. */
export const FILL_DAYS = 7;

export const EVERY_DAY: Weekday[] = [0, 1, 2, 3, 4, 5, 6];
export const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5];

/** "Every day", "Every weekday", "Every Sunday" or "Every Mon, Wed, Fri". */
export function seriesRepeatLabel(days: readonly Weekday[]): string {
  const sorted = [...new Set(days)].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  if (sorted.length === 7) return 'Every day';
  if (sorted.length === 5 && WEEKDAYS.every((d) => sorted.includes(d))) return 'Every weekday';
  if (sorted.length === 1) return `Every ${WEEKDAY_NAMES[sorted[0]!]}`;
  return `Every ${sorted.map((d) => WEEKDAY_NAMES[d].slice(0, 3)).join(', ')}`;
}

/** The next day a repeating task lands on that doesn't have its copy made yet, or null once it has ended. */
export function nextSeriesDate(series: TaskSeries, today: ISODate): ISODate | null {
  let d = series.filledThrough ? addDays(series.filledThrough, 1) : series.startDate;
  if (d < series.startDate) d = series.startDate;
  if (d < today) d = today;
  for (let i = 0; i < 7; i++, d = addDays(d, 1)) {
    if (series.until && d > series.until) return null;
    if (series.days.includes(weekdayOf(d))) return d;
  }
  return null;
}

/** A day's copy has the same id on every device, so two devices filling the same week don't make it twice. */
export const copyId = (seriesId: string, date: ISODate) => `${seriesId}@${date}`;

/** A repeating task's item for one day. */
export function copyOf(series: TaskSeries, date: ISODate, createdAt: string): Task {
  return {
    id: copyId(series.id, date),
    title: series.title,
    dueDate: date,
    // A day's copy is planned on its own day, never pulled forward like a one-off task.
    notBefore: date,
    estimateMinutes: series.estimateMinutes,
    ...(series.notes ? { notes: series.notes } : {}),
    createdAt,
    seriesId: series.id,
  };
}

/**
 * Brings repeating tasks up to date for `today`:
 * - makes each one's copies for the next week,
 * - and clears copies from past days that were never finished, so missed days don't pile up.
 *   A copy you logged some time on is kept and marked finished instead.
 *
 * Returns `data` itself when nothing changed.
 */
/** Tasks you've started: ones with time logged, or with the timer running. */
export function startedTaskIds(data: AppData): Set<string> {
  const ids = new Set(data.logs.map((l) => l.taskId));
  if (data.timer) ids.add(data.timer.taskId);
  return ids;
}

export function fillSeries(data: AppData, today: ISODate): AppData {
  const allSeries = data.series ?? [];
  const createdAt = new Date().toISOString();
  const lastDay = addDays(today, FILL_DAYS - 1);
  let changed = false;

  const added: Task[] = [];
  const existing = new Set(data.tasks.filter((t) => t.seriesId).map((t) => `${t.seriesId}/${t.dueDate}`));
  const series = allSeries.map((s) => {
    // Skipped days only matter until they've passed.
    const skipped = s.skipped?.filter((d) => d >= today);
    const pruned = skipped && skipped.length !== s.skipped!.length;
    let from = s.filledThrough ? addDays(s.filledThrough, 1) : s.startDate;
    if (from < s.startDate) from = s.startDate;
    if (from < today) from = today;
    const to = s.until && s.until < lastDay ? s.until : lastDay;
    if (from > to && !pruned) return s;
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (s.days.includes(weekdayOf(d)) && !existing.has(`${s.id}/${d}`) && !skipped?.includes(d)) {
        added.push(copyOf(s, d, createdAt));
      }
    }
    changed = true;
    const { skipped: _skipped, ...rest } = s;
    return { ...rest, filledThrough: from > to ? s.filledThrough : to, ...(skipped?.length ? { skipped } : {}) };
  });

  const logged = loggedMinutesByTask(data.logs);
  const tasks: Task[] = [];
  for (const task of data.tasks) {
    // A past copy with its timer still running is left alone until the timer stops, so that time isn't lost.
    const timing = data.timer?.taskId === task.id;
    if (!task.seriesId || task.dueDate >= today || timing || isTaskComplete(task, logged.get(task.id) ?? 0)) {
      tasks.push(task);
    } else if ((logged.get(task.id) ?? 0) > 0) {
      tasks.push({ ...task, completedAt: createdAt });
      changed = true;
    } else {
      changed = true;
    }
  }

  if (!changed) return data;
  return { ...data, series, tasks: [...tasks, ...added] };
}
