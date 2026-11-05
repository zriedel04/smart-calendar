import { weekdayOf, type ISODate, type Weekday } from './dates';

/** A US holiday or well-known observance. Shown on the calendar only; it never changes work hours. */
export interface Holiday {
  date: ISODate;
  name: string;
  /** A federal holiday, when banks, post offices and many schools close. */
  federal: boolean;
}

function iso(year: number, month: number, day: number): ISODate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** The `n`th `weekday` of a month, such as the 4th Thursday of November. */
function nthWeekday(year: number, month: number, weekday: Weekday, n: number): ISODate {
  const first = weekdayOf(iso(year, month, 1));
  return iso(year, month, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7);
}

/** The last `weekday` of a month, such as the last Monday of May. */
function lastWeekday(year: number, month: number, weekday: Weekday): ISODate {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = weekdayOf(iso(year, month, lastDay));
  return iso(year, month, lastDay - ((last - weekday + 7) % 7));
}

/** Easter Sunday in the Gregorian calendar (the anonymous Gregorian algorithm). */
export function easterSunday(year: number): ISODate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(year, month, day);
}

const MON: Weekday = 1;
const THU: Weekday = 4;
const SUN: Weekday = 0;

function computeYear(year: number): Holiday[] {
  const federal = (date: ISODate, name: string): Holiday => ({ date, name, federal: true });
  const observance = (date: ISODate, name: string): Holiday => ({ date, name, federal: false });
  return [
    federal(iso(year, 1, 1), "New Year's Day"),
    federal(nthWeekday(year, 1, MON, 3), 'Martin Luther King Jr. Day'),
    observance(iso(year, 2, 14), "Valentine's Day"),
    federal(nthWeekday(year, 2, MON, 3), "Presidents' Day"),
    observance(iso(year, 3, 17), "St. Patrick's Day"),
    observance(easterSunday(year), 'Easter'),
    observance(nthWeekday(year, 5, SUN, 2), "Mother's Day"),
    federal(lastWeekday(year, 5, MON), 'Memorial Day'),
    observance(nthWeekday(year, 6, SUN, 3), "Father's Day"),
    federal(iso(year, 6, 19), 'Juneteenth'),
    federal(iso(year, 7, 4), 'Independence Day'),
    federal(nthWeekday(year, 9, MON, 1), 'Labor Day'),
    federal(nthWeekday(year, 10, MON, 2), "Columbus / Indigenous Peoples' Day"),
    observance(iso(year, 10, 31), 'Halloween'),
    federal(iso(year, 11, 11), 'Veterans Day'),
    federal(nthWeekday(year, 11, THU, 4), 'Thanksgiving'),
    observance(iso(year, 12, 24), 'Christmas Eve'),
    federal(iso(year, 12, 25), 'Christmas Day'),
    observance(iso(year, 12, 31), "New Year's Eve"),
  ].sort((x, y) => x.date.localeCompare(y.date));
}

const byYear = new Map<number, Map<ISODate, Holiday[]>>();

/** The holidays in `year`, by date. Worked out once per year and kept. */
function yearIndex(year: number): Map<ISODate, Holiday[]> {
  let index = byYear.get(year);
  if (!index) {
    index = new Map();
    for (const h of computeYear(year)) index.set(h.date, [...(index.get(h.date) ?? []), h]);
    byYear.set(year, index);
  }
  return index;
}

/** All holidays in `year`, in date order. */
export function holidaysInYear(year: number): Holiday[] {
  return [...yearIndex(year).values()].flat();
}

/** The holidays on `date`, usually none or one. */
export function holidaysOn(date: ISODate): Holiday[] {
  return yearIndex(Number(date.slice(0, 4))).get(date) ?? [];
}
