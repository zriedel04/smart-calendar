import { addDays, isISODate, weekdayOf, type ISODate } from './dates';
import type { Minutes } from './time';

/** What a quick-add line like "Essay due Fri 3h" says, with those words taken out of the title. */
export interface QuickTask {
  title: string;
  dueDate?: ISODate;
  estimateMinutes?: Minutes;
}

const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12,
};

const WEEKDAY_WORDS = Object.keys(WEEKDAYS).sort((a, b) => b.length - a.length).join('|');
const FULL_WEEKDAYS = Object.keys(WEEKDAYS).filter((w) => w.endsWith('day')).join('|');
const MONTH_WORDS = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');
const LEAD = String.raw`(?:(?:due|by|on)\s+)?`;

/** A date in the coming year: this year's, or next year's once this year's has passed. */
function upcomingDate(month: number, day: number, today: ISODate): ISODate | undefined {
  const year = Number(today.slice(0, 4));
  for (const y of [year, year + 1]) {
    const date = `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (!isISODate(date)) return undefined;
    if (date >= today) return date;
  }
  return undefined;
}

/** The next time it's that weekday, counting today; "next" skips to the one in the following week. */
function weekdayDate(weekday: number, today: ISODate, next: boolean): ISODate {
  let date = addDays(today, (weekday - weekdayOf(today) + 7) % 7);
  if (next) {
    // Weeks start on Monday: "next Friday" said on a Tuesday is the Friday after this one.
    const daysToMonday = (8 - weekdayOf(today)) % 7 || 7;
    if (date < addDays(today, daysToMonday)) date = addDays(date, 7);
  }
  return date;
}

type Rule = { pattern: RegExp; date: (m: RegExpExecArray, today: ISODate) => ISODate | undefined };

const DATE_RULES: Rule[] = [
  { pattern: new RegExp(String.raw`\b${LEAD}(today|tonight)\b(?!')`, 'i'), date: (_m, today) => today },
  { pattern: new RegExp(String.raw`\b${LEAD}(tomorrow|tmrw|tmr)\b`, 'i'), date: (_m, today) => addDays(today, 1) },
  {
    pattern: new RegExp(String.raw`\b${LEAD}in\s+(\d{1,3})\s+(days?|weeks?)\b`, 'i'),
    date: (m, today) => addDays(today, Number(m[1]) * (m[2]!.toLowerCase().startsWith('week') ? 7 : 1)),
  },
  { pattern: new RegExp(String.raw`\b${LEAD}next\s+week\b`, 'i'), date: (_m, today) => addDays(today, 7) },
  // A full weekday name anywhere; a short one ("Sat") only after due, by, on or next, so "SAT prep" stays a title.
  {
    pattern: new RegExp(String.raw`\b${LEAD}(next\s+)?(${FULL_WEEKDAYS})\b(?!')`, 'i'),
    date: (m, today) => weekdayDate(WEEKDAYS[m[2]!.toLowerCase()]!, today, Boolean(m[1])),
  },
  {
    pattern: new RegExp(String.raw`\b(?:(?:due|by|on)\s+(next\s+)?|(next)\s+)(${WEEKDAY_WORDS})\b`, 'i'),
    date: (m, today) => weekdayDate(WEEKDAYS[m[3]!.toLowerCase()]!, today, Boolean(m[1] || m[2])),
  },
  {
    pattern: new RegExp(String.raw`\b${LEAD}(${MONTH_WORDS})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b`, 'i'),
    date: (m, today) => upcomingDate(MONTHS[m[1]!.toLowerCase()]!, Number(m[2]), today),
  },
  {
    pattern: new RegExp(String.raw`\b${LEAD}(\d{1,2})/(\d{1,2})\b(?!/)`, 'i'),
    date: (m, today) => upcomingDate(Number(m[1]), Number(m[2]), today),
  },
];

const ESTIMATE_RULES: { pattern: RegExp; minutes: (m: RegExpExecArray) => number }[] = [
  // "1h30m", "1h 30m", "1 hr 30 min"
  {
    pattern: /\b(\d{1,2})\s*(?:h|hrs?|hours?)\s*(\d{1,2})\s*(?:m|mins?|minutes?)\b/i,
    minutes: (m) => Number(m[1]) * 60 + Number(m[2]),
  },
  { pattern: /\b(\d{1,3}(?:\.\d+)?|\.\d+)\s*(?:h|hrs?|hours?)\b/i, minutes: (m) => Number(m[1]) * 60 },
  { pattern: /\b(\d{1,3})\s*(?:m|mins?|minutes?)\b/i, minutes: (m) => Number(m[1]) },
];

/**
 * Reads a due date and a time estimate out of a line like "Essay due Fri 3h" or "Lab report 11/30 90 min".
 * Whatever isn't recognized stays as the title. Only the first date and the first estimate count.
 */
export function parseQuickTask(text: string, today: ISODate): QuickTask {
  let rest = ` ${text} `;
  let dueDate: ISODate | undefined;
  let estimateMinutes: Minutes | undefined;

  for (const rule of ESTIMATE_RULES) {
    const m = rule.pattern.exec(rest);
    if (!m) continue;
    const minutes = Math.round(rule.minutes(m));
    if (minutes >= 5 && minutes <= 200 * 60) {
      estimateMinutes = minutes;
      rest = rest.slice(0, m.index) + ' ' + rest.slice(m.index + m[0].length);
    }
    break;
  }
  for (const rule of DATE_RULES) {
    const m = rule.pattern.exec(rest);
    if (!m) continue;
    const date = rule.date(m, today);
    if (date) {
      dueDate = date;
      rest = rest.slice(0, m.index) + ' ' + rest.slice(m.index + m[0].length);
      break;
    }
  }

  const title = rest
    .replace(/\s+/g, ' ')
    .trim()
    // Words left dangling once the date or estimate is taken out, as in "Essay - due" or "Read for".
    .replace(/(?:\s*[-–,:·]\s*|\s+(?:due|by|on|for|at))+$/i, '')
    .replace(/^[-–,:·]\s*/, '')
    .trim();
  return { title, ...(dueDate ? { dueDate } : {}), ...(estimateMinutes ? { estimateMinutes } : {}) };
}
