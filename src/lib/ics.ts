import { addDays, daysBetween, weekdayOf, type ISODate } from './dates';
import type { EventRepeat } from './availability';
import type { Minutes } from './time';

/**
 * One entry read from an .ics calendar file (Canvas, Google Calendar, Apple Calendar, Outlook).
 * Times are converted to this device's time zone.
 */
export interface IcsEntry {
  /** The entry's UID, used to avoid importing the same entry twice. */
  uid: string;
  title: string;
  /** The (first) date it happens on. */
  date: ISODate;
  /** The last date of a multi-day all-day entry. Equals `date` otherwise. */
  endDate: ISODate;
  allDay: boolean;
  /** Start and end within the day, for timed entries. */
  start: Minutes;
  end: Minutes;
  repeat: EventRepeat;
  /** For repeating entries with an end, such as a class that runs until the end of the semester. */
  until?: ISODate;
  /** True for Canvas assignments and other due-at-a-moment entries, which should become tasks. */
  looksLikeAssignment: boolean;
}

interface Property {
  name: string;
  params: Record<string, string>;
  value: string;
}

/** Splits `NAME;PARAM=x;PARAM2="y:z":value` into its parts. Colons inside quoted params don't end the name. */
function parseLine(line: string): Property | null {
  let inQuotes = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ':' && !inQuotes) {
      colon = i;
      break;
    }
  }
  if (colon < 0) return null;
  const [name = '', ...paramParts] = line.slice(0, colon).split(';');
  const params: Record<string, string> = {};
  for (const part of paramParts) {
    const eq = part.indexOf('=');
    if (eq > 0) params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1) };
}

function unescapeText(value: string): string {
  return value.replace(/\\([nN,;\\])/g, (_, ch: string) => (ch === 'n' || ch === 'N' ? ' ' : ch)).trim();
}

const pad = (n: number) => String(n).padStart(2, '0');

/** The offset of `timeZone` from UTC, in minutes, at the given instant. */
function zoneOffsetMinutes(timeZone: string, utcMillis: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(utcMillis));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - utcMillis) / 60000);
}

interface Moment {
  date: ISODate;
  /** Minutes after midnight, or null for a date with no time. */
  minutes: Minutes | null;
}

/** Reads a DTSTART/DTEND/UNTIL value as a date and time in this device's time zone. */
function parseMoment(value: string, tzid?: string): Moment | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, hh, mm, ss, z] = m;
  const date = `${y}-${mo}-${d}`;
  if (hh === undefined) return { date, minutes: null };

  const wall = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm), Number(ss ?? 0));
  let instant: number | null = null;
  if (z) instant = wall;
  else if (tzid) {
    try {
      // Wall-clock time in another zone: shift by that zone's offset (twice, to settle across DST changes).
      let guess = wall - zoneOffsetMinutes(tzid, wall) * 60000;
      guess = wall - zoneOffsetMinutes(tzid, guess) * 60000;
      instant = guess;
    } catch {
      instant = null; // Unknown zone name: treat the time as local.
    }
  }
  if (instant === null) return { date, minutes: Number(hh) * 60 + Number(mm) };

  const local = new Date(instant);
  return {
    date: `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`,
    minutes: local.getHours() * 60 + local.getMinutes(),
  };
}

/** Minutes in an ISO 8601 duration such as PT1H30M or P1D. */
function parseDuration(value: string): Minutes | null {
  const m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:\d+S)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, w, d, h, min] = m.map((v) => Number(v ?? 0));
  return (((w ?? 0) * 7 + (d ?? 0)) * 24 + (h ?? 0)) * 60 + (min ?? 0);
}

const ICS_WEEKDAYS: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

/**
 * Parses the text of an .ics file into entries. Cancelled entries and one-off changes to a
 * repeating series are left out. Weekly entries on several days (a Mon/Wed/Fri class) become
 * one weekly entry per day. Repeat rules other than weekly and yearly are imported as a single date.
 */
export function parseIcs(text: string): IcsEntry[] {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const entries: IcsEntry[] = [];
  let props: Property[] | null = null;
  let nested = 0;

  for (const line of lines) {
    const upper = line.trim().toUpperCase();
    if (upper === 'BEGIN:VEVENT') {
      props = [];
      nested = 0;
      continue;
    }
    if (!props) continue;
    if (upper.startsWith('BEGIN:')) {
      nested++; // A reminder (VALARM) or similar inside the event.
      continue;
    }
    if (upper.startsWith('END:')) {
      if (nested > 0) nested--;
      else {
        entries.push(...toEntries(props));
        props = null;
      }
      continue;
    }
    if (nested === 0) {
      const prop = parseLine(line);
      if (prop) props.push(prop);
    }
  }
  return entries;
}

function toEntries(props: Property[]): IcsEntry[] {
  const get = (name: string) => props.find((p) => p.name === name);
  if (get('RECURRENCE-ID')) return [];
  if (get('STATUS')?.value.trim().toUpperCase() === 'CANCELLED') return [];

  const startProp = get('DTSTART');
  if (!startProp) return [];
  const start = parseMoment(startProp.value, startProp.params.TZID);
  if (!start) return [];
  const allDay = start.minutes === null;

  const endProp = get('DTEND');
  let end = endProp ? parseMoment(endProp.value, endProp.params.TZID) : null;
  const duration = get('DURATION');
  if (!end && duration) {
    const minutes = parseDuration(duration.value);
    if (minutes !== null) {
      const total = (start.minutes ?? 0) + minutes;
      end = {
        date: addDays(start.date, Math.floor(total / 1440)),
        minutes: allDay ? null : total % 1440,
      };
    }
  }

  // All-day end dates are exclusive in .ics files: an entry on just the 5th ends on the 6th.
  let endDate = start.date;
  if (allDay && end && end.date > start.date) endDate = addDays(end.date, -1);

  const startMinutes = start.minutes ?? 0;
  let endMinutes = startMinutes;
  if (!allDay && end && end.minutes !== null) {
    // An entry that runs past midnight is cut off at the end of its first day.
    endMinutes = end.date > start.date ? 24 * 60 : Math.max(startMinutes, end.minutes);
  }

  const uid = get('UID')?.value.trim() || `${start.date}-${get('SUMMARY')?.value ?? ''}`;
  const title = unescapeText(get('SUMMARY')?.value ?? '') || 'Untitled';
  const url = get('URL')?.value ?? '';
  const looksLikeAssignment =
    /assignment/i.test(uid) || /assignment/i.test(url) || (!allDay && endMinutes === startMinutes);

  const base: IcsEntry = {
    uid,
    title,
    date: start.date,
    endDate,
    allDay,
    start: startMinutes,
    end: endMinutes,
    repeat: 'none',
    looksLikeAssignment,
  };

  const rrule = get('RRULE');
  if (!rrule) return [base];
  const rule: Record<string, string> = {};
  for (const part of rrule.value.split(';')) {
    const [k, v] = part.split('=');
    if (k && v) rule[k.toUpperCase()] = v.toUpperCase();
  }
  if (rule.INTERVAL && rule.INTERVAL !== '1') return [base];
  if (rule.FREQ !== 'YEARLY' && rule.FREQ !== 'WEEKLY') return [base];

  // Repeat rules describe dates in the entry's own time zone. `shift` is how many days converting
  // the start time to this device's zone moved it (for example, Monday 1am UTC is Sunday evening in Phoenix).
  const sourceDate = `${startProp.value.slice(0, 4)}-${startProp.value.slice(4, 6)}-${startProp.value.slice(6, 8)}`;
  const shift = daysBetween(sourceDate, start.date);
  const toLocal = (date: ISODate) => addDays(date, shift);

  const byDay = (rule.BYDAY ?? '')
    .split(',')
    .map((d) => ICS_WEEKDAYS[d.slice(-2)])
    .filter((d): d is number => d !== undefined);
  const weekdays = rule.FREQ === 'WEEKLY' && byDay.length > 0 ? byDay : [weekdayOf(sourceDate)];

  // The last date the series can happen on, from UNTIL or from COUNT.
  let until: ISODate | undefined = rule.UNTIL ? parseMoment(rule.UNTIL)?.date : undefined;
  const count = rule.COUNT ? Number(rule.COUNT) : NaN;
  if (!until && Number.isInteger(count) && count > 0) {
    if (rule.FREQ === 'YEARLY') {
      until = toLocal(`${Number(sourceDate.slice(0, 4)) + count - 1}${sourceDate.slice(4)}`);
    } else {
      let last = sourceDate;
      let seen = 0;
      for (let d = sourceDate; seen < count; d = addDays(d, 1)) {
        if (weekdays.includes(weekdayOf(d))) {
          seen++;
          last = d;
        }
      }
      until = toLocal(last);
    }
  }
  const withUntil = until ? { until } : {};

  if (rule.FREQ === 'YEARLY') return [{ ...base, repeat: 'yearly', ...withUntil }];
  return weekdays.map((weekday) => {
    const date = toLocal(firstOn(sourceDate, weekday));
    return { ...base, repeat: 'weekly' as const, ...withUntil, date, endDate: date };
  });
}

/** The first date on or after `from` that falls on `weekday`. */
function firstOn(from: ISODate, weekday: number): ISODate {
  return addDays(from, (weekday - weekdayOf(from) + 7) % 7);
}
