import type { CalendarEvent, DateOverrides, WeeklyHours } from '../lib/availability';
import type { ISODate, Weekday } from '../lib/dates';
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
  /** Set when you push a task off your list: no work on it is planned before this date. */
  notBefore?: ISODate;
  /** The day you chose to work on it. Work goes on that day first instead of in due-date order. */
  planDate?: ISODate;
  /** The repeating task this is one day's copy of. */
  seriesId?: string;
  /** The calendar link this came from, so later refreshes keep it up to date. */
  feedId?: string;
  /** What the calendar link said about it when last applied, so your own edits survive a refresh. */
  sourceStamp?: string;
}

/**
 * A task that repeats, such as "Study 1h every weekday". Each day it lands on gets its own
 * copy in `tasks`, made a week ahead, so ticking, logging and pushing work as for any task.
 */
export interface TaskSeries {
  id: string;
  title: string;
  estimateMinutes: Minutes;
  notes?: string;
  /** The days of the week it repeats on. */
  days: Weekday[];
  /** The first day it can land on. */
  startDate: ISODate;
  /** The last day it can land on, if it stops. */
  until?: ISODate;
  createdAt: string;
  /** Copies have been made up to this date, so a copy you delete doesn't come back. */
  filledThrough?: ISODate;
  /** Upcoming days you skipped, so remaking copies after an edit doesn't bring them back. */
  skipped?: ISODate[];
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
  /** Repeating tasks. Missing in data saved before they existed. */
  series?: TaskSeries[];
  /** A timer running on a task. Stopping it logs the time. */
  timer?: RunningTimer;
  /** Calendar links (Canvas, Google, Outlook) kept up to date automatically. */
  feeds?: CalendarFeed[];
}

/** A calendar link the app refreshes by itself, adding, updating and removing what it brought in. */
export interface CalendarFeed {
  id: string;
  /** An https link to an .ics calendar. */
  url: string;
  name: string;
  /** The estimate each new assignment from this link starts with. */
  estimateMinutes: Minutes;
  /** ISO timestamp. */
  addedAt: string;
  /** Items from this link you deleted, so refreshing doesn't bring them back. */
  dismissed?: string[];
  /** The courses this link's entries belong to, as of its last refresh, such as "CSE 485". */
  courses?: string[];
  /** Courses whose entries you don't want from this link. */
  hiddenCourses?: string[];
}

export interface RunningTimer {
  taskId: string;
  /** ISO timestamp. */
  startedAt: string;
}

export type { CalendarEvent, ISODate, Minutes, TimeRange };
