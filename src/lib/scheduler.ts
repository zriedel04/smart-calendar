import { addDays, type ISODate } from './dates';
import type { Minutes } from './time';

/**
 * The scheduler is a pure function: give it the work left on each task and a way to
 * look up how many minutes you can work on a given day, and it returns a day-by-day plan.
 *
 * Strategy: earliest due date first (EDF), filling every day to capacity starting today.
 * - Filling each day completely is what pulls future work forward, so a day with nothing
 *   due is still a full work day and you stay ahead.
 * - Working in due-date order is optimal for deadlines when work can be split across days:
 *   if any plan can finish everything on time, this one does.
 * - Tasks that don't fit in a day are split and continue on the next day with free time.
 */

export interface SchedulableTask {
  id: string;
  dueDate: ISODate;
  remainingMinutes: Minutes;
  /**
   * The task's full size, used to break ties between tasks due on the same day (smaller first).
   * It must not change as work is logged, or ticking off one task could reorder today's list.
   * Defaults to `remainingMinutes`.
   */
  sizeMinutes?: Minutes;
  /** Used only to break ties between tasks due on the same day. */
  createdAt?: string;
  /** No work is planned on the task before this date, such as after pushing it to tomorrow. */
  notBefore?: ISODate;
  /** No work is planned on the task after this date; whatever is left stays unscheduled. */
  lastDate?: ISODate;
  /**
   * The day you chose to work on it. Nothing is planned before it, and on that day it goes ahead
   * of everything else. Whatever doesn't fit carries on to the next days like any other task.
   */
  planDate?: ISODate;
}

export interface PlanItem {
  taskId: string;
  date: ISODate;
  minutes: Minutes;
}

export interface DayPlan {
  date: ISODate;
  /** Minutes the scheduler could fill on this day. */
  capacity: Minutes;
  /** Minutes it actually filled. */
  planned: Minutes;
  items: PlanItem[];
}

export interface TaskForecast {
  taskId: string;
  /** The last day the task is scheduled on, or null if it doesn't fit within the horizon. */
  finishDate: ISODate | null;
  /** Work that couldn't be placed before the horizon (usually because no hours are set). */
  unscheduledMinutes: Minutes;
  /** True if the task won't be finished by the end of its due date. */
  atRisk: boolean;
}

export interface ScheduleInput {
  today: ISODate;
  tasks: readonly SchedulableTask[];
  capacityOn: (date: ISODate) => Minutes;
  /** Don't schedule a slice smaller than this unless it finishes the task. Default 15. */
  minChunkMinutes?: Minutes;
  /** How many days ahead to look before giving up. Default 365. */
  horizonDays?: number;
}

export interface Schedule {
  days: DayPlan[];
  forecasts: Map<string, TaskForecast>;
  /** The plan for one date. Dates with no scheduled work return an empty plan. */
  dayPlan: (date: ISODate) => DayPlan;
}

export const DEFAULT_MIN_CHUNK_MINUTES = 15;
export const DEFAULT_HORIZON_DAYS = 365;

/** Due date first, then smaller tasks (quick wins), then oldest first, then id for stability. */
export function compareTasks(a: SchedulableTask, b: SchedulableTask): number {
  if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
  const sizeA = a.sizeMinutes ?? a.remainingMinutes;
  const sizeB = b.sizeMinutes ?? b.remainingMinutes;
  if (sizeA !== sizeB) return sizeA - sizeB;
  const createdA = a.createdAt ?? '';
  const createdB = b.createdAt ?? '';
  if (createdA !== createdB) return createdA < createdB ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function buildSchedule(input: ScheduleInput): Schedule {
  const minChunk = input.minChunkMinutes ?? DEFAULT_MIN_CHUNK_MINUTES;
  const horizon = input.horizonDays ?? DEFAULT_HORIZON_DAYS;

  const queue = input.tasks
    .filter((t) => t.remainingMinutes > 0)
    .slice()
    .sort(compareTasks)
    .map((task) => ({ task, left: Math.round(task.remainingMinutes), expired: false }));

  const days: DayPlan[] = [];
  const lastDay = new Map<string, ISODate>();
  let workLeft = queue.reduce((sum, q) => sum + q.left, 0);

  for (let offset = 0; offset < horizon && workLeft > 0; offset++) {
    const date = addDays(input.today, offset);
    const capacity = Math.max(0, Math.floor(input.capacityOn(date)));
    let free = capacity;
    const items: PlanItem[] = [];
    // Work that can only happen today goes first, then tasks you chose to work on today,
    // then everything else in due-date order.
    const rank = (q: (typeof queue)[number]) => (q.task.lastDate === date ? 0 : q.task.planDate === date ? 1 : 2);
    const order = queue.some((q) => rank(q) < 2) ? queue.slice().sort((a, b) => rank(a) - rank(b)) : queue;

    for (const entry of order) {
      if (free <= 0) break;
      if (entry.left <= 0 || entry.expired) continue;
      if (entry.task.lastDate && date > entry.task.lastDate) {
        // Past its last day: what's left can't be placed, so stop counting it as work to do.
        entry.expired = true;
        workLeft -= entry.left;
        continue;
      }
      if (entry.task.notBefore && date < entry.task.notBefore) continue;
      if (entry.task.planDate && date < entry.task.planDate) continue;

      const slice = Math.min(entry.left, free);
      // A tiny slice of a big task isn't useful. Leave the gap for a smaller task that fits.
      if (slice < entry.left && slice < minChunk) continue;

      items.push({ taskId: entry.task.id, date, minutes: slice });
      entry.left -= slice;
      free -= slice;
      workLeft -= slice;
      lastDay.set(entry.task.id, date);
    }

    days.push({ date, capacity, planned: capacity - free, items });
  }

  const forecasts = new Map<string, TaskForecast>();
  for (const { task, left } of queue) {
    const finishDate = left > 0 ? null : (lastDay.get(task.id) ?? null);
    forecasts.set(task.id, {
      taskId: task.id,
      finishDate,
      unscheduledMinutes: left,
      atRisk: finishDate === null || finishDate > task.dueDate,
    });
  }

  const byDate = new Map(days.map((d) => [d.date, d]));
  const dayPlan = (date: ISODate): DayPlan =>
    byDate.get(date) ?? { date, capacity: 0, planned: 0, items: [] };

  return { days, forecasts, dayPlan };
}
