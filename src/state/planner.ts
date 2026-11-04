import { capacityOn } from '../lib/availability';
import type { ISODate } from '../lib/dates';
import { buildSchedule, type PlanItem, type Schedule } from '../lib/scheduler';
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
      ...(task.notBefore ? { notBefore: task.notBefore } : {}),
      ...(task.planDate && !task.seriesId ? { planDate: task.planDate } : {}),
      // A repeating task's copy is only ever worked on its own day.
      ...(task.seriesId ? { lastDate: task.dueDate } : {}),
      sizeMinutes: task.estimateMinutes,
      remainingMinutes: remainingMinutes(task, logged.get(task.id) ?? 0),
    })),
    capacityOn: (date) => {
      const capacity = capacityOn(data, date);
      return date === today ? Math.max(0, capacity - doneToday) : capacity;
    },
  });

  // A repeating task's copy that doesn't fit in its day's hours, such as laundry on a day off,
  // still goes on that day's list rather than being dropped.
  const extra = new Map<ISODate, PlanItem[]>();
  for (const task of data.tasks) {
    const forecast = schedule.forecasts.get(task.id);
    if (!task.seriesId || !forecast || forecast.unscheduledMinutes <= 0 || task.dueDate < today) continue;
    extra.set(task.dueDate, [...(extra.get(task.dueDate) ?? []), { taskId: task.id, date: task.dueDate, minutes: forecast.unscheduledMinutes }]);
    schedule.forecasts.set(task.id, { ...forecast, finishDate: task.dueDate, unscheduledMinutes: 0, atRisk: false });
  }
  if (extra.size === 0) return { ...schedule, today, doneToday, logged };

  const days = schedule.days.map((day) => {
    const more = extra.get(day.date);
    if (!more) return day;
    // Merge with any part that did fit, so the task shows as one item.
    const items = [...day.items];
    for (const item of more) {
      const i = items.findIndex((x) => x.taskId === item.taskId);
      if (i >= 0) items[i] = { ...items[i]!, minutes: items[i]!.minutes + item.minutes };
      else items.push(item);
    }
    return { ...day, items };
  });
  for (const [date, items] of extra) {
    if (!days.some((d) => d.date === date)) days.push({ date, capacity: 0, planned: 0, items });
  }
  days.sort((a, b) => a.date.localeCompare(b.date));
  const byDate = new Map(days.map((d) => [d.date, d]));
  const dayPlan = (date: ISODate) => byDate.get(date) ?? { date, capacity: 0, planned: 0, items: [] };
  return { ...schedule, days, dayPlan, today, doneToday, logged };
}
