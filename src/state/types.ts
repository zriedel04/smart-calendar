import type { CalendarEvent, DateOverrides, WeeklyHours } from '../lib/availability';
import type { ISODate } from '../lib/dates';
import type { Minutes, TimeRange } from '../lib/time';

export interface Task {
  id: string;
  title: string;
  dueDate: ISODate;
  estimateMinutes: Minutes;
  notes?: string;
  /** ISO timestamp. */
  createdAt: string;
  /** Set when you mark a task finished yourself, even if you logged less time than estimated. */
  completedAt?: string;
  /** The calendar entry this was imported from, so importing the same file twice doesn't add it twice. */
  sourceId?: string;
}

/** Time you spent on a task on a given day. Ticking an item on the Today list creates one. */
export interface WorkLog {
  id: string;
  taskId: string;
  date: ISODate;
  minutes: Minutes;
}

export interface AppData {
  version: 1;
  tasks: Task[];
  logs: WorkLog[];
  weeklyHours: WeeklyHours;
  overrides: DateOverrides;
  events: CalendarEvent[];
}

export type { CalendarEvent, ISODate, Minutes, TimeRange };
