import { daysBetween, type ISODate } from './dates';

/**
 * How pressing a task is, based on how far away its due date is:
 * - overdue: the due date has passed
 * - urgent: due today
 * - needed: due within the next 7 days
 * - todo: due more than a week from now
 */
export type Priority = 'overdue' | 'urgent' | 'needed' | 'todo';

export const PRIORITY_ORDER: readonly Priority[] = ['overdue', 'urgent', 'needed', 'todo'];

export const PRIORITY_LABEL: Record<Priority, string> = {
  overdue: 'Overdue',
  urgent: 'Urgent',
  needed: 'Needed',
  todo: 'To do',
};

export function priorityOf(dueDate: ISODate, today: ISODate): Priority {
  const daysLeft = daysBetween(today, dueDate);
  if (daysLeft < 0) return 'overdue';
  if (daysLeft === 0) return 'urgent';
  if (daysLeft <= 7) return 'needed';
  return 'todo';
}
