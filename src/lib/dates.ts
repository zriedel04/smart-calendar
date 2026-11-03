/**
 * Calendar dates are stored as plain ISO strings (`YYYY-MM-DD`).
 *
 * All arithmetic happens in UTC on purpose: a calendar day has no time zone,
 * so doing the math in UTC means daylight-saving changes can never shift a
 * date forwards or backwards by accident.
 */
export type ISODate = string;

/** 0 = Sunday ... 6 = Saturday, matching `Date.prototype.getDay()`. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

function toUTCDate(date: ISODate): Date {
  const match = ISO_DATE.exec(date);
  if (!match) throw new Error(`Invalid ISO date: "${date}"`);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function fromUTCDate(date: Date): ISODate {
  return date.toISOString().slice(0, 10);
}

export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  return fromUTCDate(toUTCDate(value)) === value;
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = toUTCDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUTCDate(d);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: ISODate, to: ISODate): number {
  return Math.round((toUTCDate(to).getTime() - toUTCDate(from).getTime()) / DAY_MS);
}

export function weekdayOf(date: ISODate): Weekday {
  return toUTCDate(date).getUTCDay() as Weekday;
}

/** The first day of the week containing `date` (weeks start on Monday by default). */
export function startOfWeek(date: ISODate, weekStartsOn: Weekday = 1): ISODate {
  const offset = (weekdayOf(date) - weekStartsOn + 7) % 7;
  return addDays(date, -offset);
}

/** Today's date in the user's local time zone. */
export function localToday(now: Date = new Date()): ISODate {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDate(date: ISODate, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(undefined, { ...options, timeZone: 'UTC' }).format(toUTCDate(date));
}

/** "Today", "Tomorrow", "Yesterday", or a short weekday + date such as "Fri, Nov 6". */
export function relativeDayLabel(date: ISODate, today: ISODate): string {
  const diff = daysBetween(today, date);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return formatDate(date, { weekday: 'short', month: 'short', day: 'numeric' });
}

export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/** Weekdays in the order the UI shows them (Monday first). */
export const WEEKDAYS_MONDAY_FIRST: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 0];
