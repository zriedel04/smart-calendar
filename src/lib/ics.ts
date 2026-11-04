import { addDays, daysBetween, isISODate, weekdayOf, type ISODate } from './dates';
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
  /** The moment as epoch milliseconds. Dates and floating times count as this device's local time. */
  instant: number;
}

/** Reads a DTSTART/DTEND/UNTIL value as a date and time in this device's time zone. */
function parseMoment(value: string, tzid?: string): Moment | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, hh, mm, ss, z] = m;
  const date = `${y}-${mo}-${d}`;
  if (!isISODate(date)) return null; // Such as Feb 29 in a year that doesn't have one.
  if (hh === undefined) return { date, minutes: null, instant: new Date(Number(y), Number(mo) - 1, Number(d)).getTime() };

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
  if (instant === null) {
    const local = new Date(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm), Number(ss ?? 0));
    return { date, minutes: Number(hh) * 60 + Number(mm), instant: local.getTime() };
  }

  const local = new Date(instant);
  return {
    date: `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`,
    minutes: local.getHours() * 60 + local.getMinutes(),
    instant,
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
 * one weekly entry per day. Repeat rules other than weekly, monthly and yearly are imported as a single date.
 */
export function parseIcs(text: string, now: Date = new Date()): IcsEntry[] {
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
        entries.push(...toEntries(props, now));
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

function toEntries(props: Property[], now: Date): IcsEntry[] {
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
        instant: start.instant + minutes * 60000,
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
  if (rule.FREQ !== 'YEARLY' && rule.FREQ !== 'MONTHLY' && rule.FREQ !== 'WEEKLY') return [base];
  const byDate = rule.FREQ !== 'WEEKLY'; // Monthly and yearly repeat on the start's day of the month.

  // Selectors the app can't represent, such as "the 4th Thursday of November", keep just the first date
  // rather than guessing at a pattern. A month or day that only restates the start date is fine.
  const sourceDate = `${startProp.value.slice(0, 4)}-${startProp.value.slice(4, 6)}-${startProp.value.slice(6, 8)}`;
  const restatesStart =
    (!rule.BYMONTH || Number(rule.BYMONTH) === Number(sourceDate.slice(5, 7))) &&
    (!rule.BYMONTHDAY || Number(rule.BYMONTHDAY) === Number(sourceDate.slice(8, 10)));
  const unsupported =
    !restatesStart ||
    ['BYYEARDAY', 'BYWEEKNO', 'BYSETPOS', 'BYHOUR', 'BYMINUTE'].some((k) => rule[k]) ||
    (rule.FREQ === 'YEARLY' && rule.BYDAY) ||
    (rule.FREQ === 'WEEKLY' && rule.BYMONTH) ||
    // Monthly on the 29th to 31st skips short months in .ics files but not in the app, so keep just the first date.
    (rule.FREQ === 'MONTHLY' && (rule.BYDAY || rule.BYMONTH || Number(sourceDate.slice(8, 10)) > 28));
  if (unsupported) return [base];

  // Repeat rules describe dates and times in the entry's own time zone. Each occurrence is converted
  // to this device's zone on its own, since daylight saving can change the gap between the two zones.
  const timePart = allDay ? '' : startProp.value.trim().slice(8);
  const occurrenceAt = (date: ISODate) => parseMoment(date.replace(/-/g, '') + timePart, startProp.params.TZID);
  // The full length, before the first occurrence was cut off at midnight; each occurrence is cut off on its own.
  const length = !allDay && end ? Math.max(0, Math.round((end.instant - start.instant) / 60000)) : 0;

  const byDay = (rule.BYDAY ?? '')
    .split(',')
    .map((d) => ICS_WEEKDAYS[d.slice(-2)])
    .filter((d): d is number => d !== undefined);
  const weekdays = rule.FREQ === 'WEEKLY' && byDay.length > 0 ? byDay : [weekdayOf(sourceDate)];

  // Where the series stops: UNTIL is a moment (a date alone means the end of that day), COUNT a number of occurrences.
  const untilMoment = rule.UNTIL ? parseMoment(rule.UNTIL) : null;
  const untilInstant = untilMoment
    ? untilMoment.minutes === null
      ? new Date(addDays(untilMoment.date, 1) + 'T00:00').getTime() - 1
      : untilMoment.instant
    : null;
  const count = rule.COUNT ? Number(rule.COUNT) : NaN;
  const counted = Number.isInteger(count) && count > 0;
  const bounded = untilInstant !== null || counted;

  // Occurrences removed from the series (EXDATE). They still count toward COUNT.
  const excluded = new Set<number>();
  for (const prop of props) {
    if (prop.name !== 'EXDATE') continue;
    for (const value of prop.value.split(',')) {
      const moment = parseMoment(value, prop.params.TZID);
      if (moment) excluded.add(moment.instant);
    }
  }

  // Without an end, look two years past today for daylight-saving changes; the last stretch then repeats forever.
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const horizon = addDays(sourceDate > today ? sourceDate : today, 731);

  // Walk the series in order. Runs of occurrences that land at the same local time, with nothing
  // excluded in between, become one repeating entry each (one set of runs per weekday).
  type Run = { first: ISODate; last: ISODate; start: Minutes; end: Minutes; broken: boolean };
  const runs = new Map<number, Run[]>(weekdays.map((w) => [w, []]));
  let seen = 0;
  for (let i = 0, d = sourceDate; i < 20000; i++) {
    if (counted && seen >= count) break;
    if (!bounded && d > horizon) break;
    const inSeries = byDate || weekdays.includes(weekdayOf(d));
    const moment = inSeries ? occurrenceAt(d) : null;
    if (inSeries && !moment) {
      // A date that doesn't exist (Feb 29 in other years) is skipped. Only a run that sits on Feb 29
      // locally skips those years by itself; any other run would show up in the gap, so it ends here.
      const run = runs.get(weekdays[0]!)!.at(-1);
      if (run && run.first.slice(5) !== '02-29') run.broken = true;
    }
    if (moment) {
      if (untilInstant !== null && moment.instant > untilInstant) break;
      seen++;
      const series = runs.get(byDate ? weekdays[0]! : weekdayOf(d))!;
      const run = series[series.length - 1];
      if (excluded.has(moment.instant)) {
        if (run) run.broken = true;
      } else {
        const startAt = moment.minutes ?? 0;
        const endAt = allDay ? 0 : Math.min(startAt + length, 24 * 60);
        // Converting zones can move an occurrence to another day of the month (Mar 1 UTC is Feb 28 here),
        // so a run only continues while each occurrence lands on the day its repeat rule would give.
        const sameSlot =
          run &&
          (rule.FREQ === 'WEEKLY'
            ? weekdayOf(moment.date) === weekdayOf(run.first)
            : rule.FREQ === 'MONTHLY'
              ? moment.date.slice(8) === run.first.slice(8)
              : moment.date.slice(5) === run.first.slice(5));
        if (run && sameSlot && !run.broken && run.start === startAt && run.end === endAt) run.last = moment.date;
        else series.push({ first: moment.date, last: moment.date, start: startAt, end: endAt, broken: false });
      }
    }
    d =
      rule.FREQ === 'YEARLY'
        ? `${Number(d.slice(0, 4)) + 1}${sourceDate.slice(4)}`
        : rule.FREQ === 'MONTHLY'
          ? nextMonth(d, sourceDate)
          : addDays(d, 1);
  }

  const repeat: EventRepeat = rule.FREQ === 'YEARLY' ? 'yearly' : rule.FREQ === 'MONTHLY' ? 'monthly' : 'weekly';
  const span = daysBetween(base.date, base.endDate);
  const entries: IcsEntry[] = [];
  for (const series of runs.values()) {
    series.forEach((run, i) => {
      // The last run of an endless series keeps repeating; every other run ends at its last occurrence.
      const runUntil = i === series.length - 1 && !bounded ? undefined : run.last;
      entries.push({
        ...base,
        repeat,
        date: run.first,
        endDate: addDays(run.first, span),
        ...(allDay ? {} : { start: run.start, end: run.end }),
        ...(runUntil ? { until: runUntil } : {}),
      });
    });
  }
  return entries.sort((a, b) => a.date.localeCompare(b.date));
}

/** The same day of the month as `start`, one month after `date`. */
function nextMonth(date: ISODate, start: ISODate): ISODate {
  const index = Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)); // The next month, counting months from 1.
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}${start.slice(7)}`;
}
