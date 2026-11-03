import { capacityOn } from '../lib/availability';
import type { ISODate } from '../lib/dates';
import { buildSchedule, type Schedule } from '../lib/scheduler';
import type { Minutes } from '../lib/time';
import type { AppData, Task, WorkLog } from './types';

export function loggedMinutesByTask(logs: readonly WorkLog[]): Map<string, Minutes> {
  const totals = new Map<string, Minutes>();
  for (const log of logs) totals.set(log.taskId, (totals.get(log.taskId) ?? 0) + log.minutes);
  return totals;
}

export function isTaskComplete(task: Task, loggedMinutes: Minutes): boolean {
  return Boolean(task.completedAt) || loggedMinutes >= task.estimateMinutes;
}

export function remainingMinutes(task: Task, loggedMinutes: Minutes): Minutes {
  return isTaskComplete(task, loggedMinutes) ? 0 : task.estimateMinutes - loggedMinutes;
}

export interface Plan extends Schedule {
  today: ISODate;
  /** Minutes already ticked off today. */
  doneToday: Minutes;
  logged: Map<string, Minutes>;
}

/**
 * Turns saved app data into a schedule.
 *
 * Time you've already ticked off today uses up part of today's hours, so the rest of
 * today's list stays the same when you tick something. Anything you didn't finish on
 * an earlier day simply goes back into the pool and gets rescheduled from today.
 */
export function planFor(data: AppData, today: ISODate): Plan {
  const logged = loggedMinutesByTask(data.logs);
  const doneToday = data.logs
    .filter((l) => l.date === today)
    .reduce((sum, l) => sum + l.minutes, 0);

  const schedule = buildSchedule({
    today,
    tasks: data.tasks.map((task) => ({
      id: task.id,
      dueDate: task.dueDate,
      createdAt: task.createdAt,
      sizeMinutes: task.estimateMinutes,
      remainingMinutes: remainingMinutes(task, logged.get(task.id) ?? 0),
    })),
    capacityOn: (date) => {
      const capacity = capacityOn(data, date);
      return date === today ? Math.max(0, capacity - doneToday) : capacity;
    },
  });

  return { ...schedule, today, doneToday, logged };
}
