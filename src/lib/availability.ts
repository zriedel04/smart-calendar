import { daysBetween, weekdayOf, type ISODate } from './dates';
import { normalizeRanges, subtractRanges, totalMinutes, type Minutes, type TimeRange } from './time';

/** Default working hours for each weekday. Index 0 is Sunday, 6 is Saturday. */
export type WeeklyHours = readonly (readonly TimeRange[])[];

/** One-off working hours for specific dates. An empty list means a day off. */
export type DateOverrides = Readonly<Record<ISODate, readonly TimeRange[]>>;

/** What an event is, which sets its icon and color. */
export type EventKind = 'busy' | 'plan' | 'birthday' | 'other';

export type EventRepeat = 'none' | 'weekly' | 'monthly' | 'yearly';

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
  /** The last date a repeating event can happen on, such as the end of a semester. */
  until?: ISODate;
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

export function eventOccursOn(event: CalendarEvent, date: ISODate): boolean {
  const diff = daysBetween(event.date, date);
  if (diff < 0) return false;
  if (event.until && date > event.until) return false;
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
