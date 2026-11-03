import { daysBetween, weekdayOf, type ISODate } from './dates';
import { normalizeRanges, subtractRanges, totalMinutes, type Minutes, type TimeRange } from './time';

/** Default working hours for each weekday. Index 0 is Sunday, 6 is Saturday. */
export type WeeklyHours = readonly (readonly TimeRange[])[];

/** One-off working hours for specific dates. An empty list means a day off. */
export type DateOverrides = Readonly<Record<ISODate, readonly TimeRange[]>>;

/** Something with a fixed time, like a class or a shift. It blocks work time. */
export interface CalendarEvent {
  id: string;
  title: string;
  /** The first (or only) date the event happens on. */
  date: ISODate;
  start: Minutes;
  end: Minutes;
  repeat: 'none' | 'weekly';
}

export interface AvailabilityRules {
  weeklyHours: WeeklyHours;
  overrides: DateOverrides;
  events: readonly CalendarEvent[];
}

export function eventOccursOn(event: CalendarEvent, date: ISODate): boolean {
  const diff = daysBetween(event.date, date);
  if (diff < 0) return false;
  return event.repeat === 'weekly' ? diff % 7 === 0 : diff === 0;
}

export function eventsOn(events: readonly CalendarEvent[], date: ISODate): CalendarEvent[] {
  return events.filter((e) => eventOccursOn(e, date)).sort((a, b) => a.start - b.start);
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

/** Working hours on `date` with fixed events cut out. */
export function freeHoursOn(rules: AvailabilityRules, date: ISODate): TimeRange[] {
  const blocked = eventsOn(rules.events, date).map(({ start, end }) => ({ start, end }));
  return subtractRanges(workingHoursOn(rules, date), blocked);
}

/** Minutes available for task work on `date`. */
export function capacityOn(rules: AvailabilityRules, date: ISODate): Minutes {
  return totalMinutes(freeHoursOn(rules, date));
}
