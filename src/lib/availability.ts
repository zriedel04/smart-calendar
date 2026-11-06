import { addDays, daysBetween, weekdayOf, type ISODate } from './dates';
import { normalizeRanges, subtractRanges, totalMinutes, type Minutes, type TimeRange } from './time';

/** Default working hours for each weekday. Index 0 is Sunday, 6 is Saturday. */
export type WeeklyHours = readonly (readonly TimeRange[])[];

/** One-off working hours for specific dates. An empty list means a day off. */
export type DateOverrides = Readonly<Record<ISODate, readonly TimeRange[]>>;

/** What an event is, which sets its icon and color. */
export type EventKind = 'busy' | 'plan' | 'birthday' | 'other';

export type EventRepeat = 'none' | 'weekly' | 'monthly' | 'yearly';

/**
 * Finer repeats, kept apart from `repeat` so an older copy of the app (say a phone that hasn't
 * reloaded yet) still reads the event, as the nearest plain repeat, instead of dropping it.
 * daily, weekdays and biweekly go with repeat 'weekly'; monthlyWeekday ("the 3rd Thursday") with 'monthly'.
 */
export type RepeatRule = 'daily' | 'weekdays' | 'biweekly' | 'monthlyWeekday';
export const REPEAT_RULES: readonly RepeatRule[] = ['daily', 'weekdays', 'biweekly', 'monthlyWeekday'];

/** The longest an event can run, so a typo can't make one cover years. */
export const MAX_EVENT_DAYS = 60;

/** Something on your calendar that isn't a task: a class, a shift, plans with friends, a birthday. */
export interface CalendarEvent {
  id: string;
  title: string;
  /** The first (or only) date the event happens on. */
  date: ISODate;
  /** Ignored for all-day events. */
  start: Minutes;
  end: Minutes;
  repeat: EventRepeat;
  /** A finer repeat than `repeat` alone; see RepeatRule. */
  rule?: RepeatRule;
  /** The last date a repeating event can happen on, such as the end of a semester. */
  until?: ISODate;
  /** The last day of an all-day event that runs several days, such as a trip. Each repeat runs as long. */
  endDate?: ISODate;
  location?: string;
  notes?: string;
  /** Defaults to 'busy', the original kind of event (classes and shifts). */
  kind?: EventKind;
  allDay?: boolean;
  /**
   * Whether the event takes time away from work. Defaults to true for timed events and false for
   * all-day ones. An all-day event that blocks work makes the whole day a day off.
   */
  blocksWork?: boolean;
  /** The calendar entry this was imported from, so importing the same file twice doesn't add it twice. */
  sourceId?: string;
  /** The calendar link this came from, so later refreshes keep it up to date. */
  feedId?: string;
  /** What the calendar link said about it when last applied, so your own edits survive a refresh. */
  sourceStamp?: string;
  /** Which run and day of its calendar entry this is, so deleting it is remembered however it's edited. */
  sourceKey?: string;
}

export function eventKind(event: CalendarEvent): EventKind {
  return event.kind ?? 'busy';
}

export function eventBlocksWork(event: CalendarEvent): boolean {
  return event.blocksWork ?? !event.allDay;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export interface AvailabilityRules {
  weeklyHours: WeeklyHours;
  overrides: DateOverrides;
  events: readonly CalendarEvent[];
}

/** How many days after the day it starts an event still runs: 0 for a one-day event. */
export function eventExtraDays(event: CalendarEvent): number {
  if (!event.allDay || !event.endDate) return 0;
  return Math.min(Math.max(daysBetween(event.date, event.endDate), 0), MAX_EVENT_DAYS - 1);
}

export function eventOccursOn(event: CalendarEvent, date: ISODate): boolean {
  const extra = eventExtraDays(event);
  for (let back = 0; back <= extra; back++) {
    if (eventStartsOn(event, back === 0 ? date : addDays(date, -back))) return true;
  }
  return false;
}

/** The nth week of the month a day falls in, from 1; 5 means the last. */
function weekOfMonth(date: ISODate): number {
  return Math.ceil(Number(date.slice(8)) / 7);
}

/** Whether a run of the event starts on `date`. */
export function eventStartsOn(event: CalendarEvent, date: ISODate): boolean {
  const diff = daysBetween(event.date, date);
  if (diff < 0) return false;
  if (event.until && date > event.until) return false;
  const rule = event.rule && REPEAT_RULES.includes(event.rule) ? event.rule : undefined;
  if (rule === 'daily') return true;
  if (rule === 'weekdays') {
    const weekday = weekdayOf(date);
    return weekday >= 1 && weekday <= 5;
  }
  if (rule === 'biweekly') return diff % 14 === 0;
  if (rule === 'monthlyWeekday') {
    if (weekdayOf(date) !== weekdayOf(event.date)) return false;
    const nth = weekOfMonth(event.date);
    // A 5th weekday means the last one, so months with only four still get it.
    if (nth >= 5) return Number(date.slice(8)) + 7 > daysInMonth(Number(date.slice(0, 4)), Number(date.slice(5, 7)));
    return weekOfMonth(date) === nth;
  }
  if (event.repeat === 'weekly') return diff % 7 === 0;
  if (event.repeat === 'monthly') {
    const day = Number(event.date.slice(8));
    const target = Number(date.slice(8));
    if (target === day) return true;
    // On the 29th to 31st, months that are too short get it on their last day instead.
    const lastDay = daysInMonth(Number(date.slice(0, 4)), Number(date.slice(5, 7)));
    return day > lastDay && target === lastDay;
  }
  if (event.repeat === 'yearly') {
    const monthDay = event.date.slice(5);
    if (date.slice(5) === monthDay) return true;
    // A Feb 29 birthday is celebrated on Feb 28 in other years. Other Feb 29 events only happen in leap years.
    return (
      eventKind(event) === 'birthday' &&
      monthDay === '02-29' &&
      date.slice(5) === '02-28' &&
      !isLeapYear(Number(date.slice(0, 4)))
    );
  }
  return diff === 0;
}

/** Events on `date`, all-day ones first, then by start time. */
export function eventsOn(events: readonly CalendarEvent[], date: ISODate): CalendarEvent[] {
  return events
    .filter((e) => eventOccursOn(e, date))
    .sort((a, b) => Number(Boolean(b.allDay)) - Number(Boolean(a.allDay)) || a.start - b.start);
}

export function hasOverride(rules: Pick<AvailabilityRules, 'overrides'>, date: ISODate): boolean {
  return Object.prototype.hasOwnProperty.call(rules.overrides, date);
}

/** The hours you said you can work on `date`: that date's override if there is one, otherwise the weekday default. */
export function workingHoursOn(
  rules: Pick<AvailabilityRules, 'weeklyHours' | 'overrides'>,
  date: ISODate,
): TimeRange[] {
  const ranges = hasOverride(rules, date)
    ? rules.overrides[date]
    : (rules.weeklyHours[weekdayOf(date)] ?? []);
  return normalizeRanges(ranges ?? []);
}

/** Working hours on `date` with events that block work cut out. */
export function freeHoursOn(rules: AvailabilityRules, date: ISODate): TimeRange[] {
  const blocking = eventsOn(rules.events, date).filter(eventBlocksWork);
  if (blocking.some((e) => e.allDay)) return [];
  const blocked = blocking.map(({ start, end }) => ({ start, end }));
  return subtractRanges(workingHoursOn(rules, date), blocked);
}

/** Minutes available for task work on `date`. */
export function capacityOn(rules: AvailabilityRules, date: ISODate): Minutes {
  return totalMinutes(freeHoursOn(rules, date));
}
