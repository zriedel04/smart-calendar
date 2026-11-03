import { CalendarDays, Cake, GraduationCap, PartyPopper, type LucideIcon } from 'lucide-react';
import { eventKind, type CalendarEvent, type EventKind } from '../lib/availability';
import { formatDate, WEEKDAY_NAMES, weekdayOf } from '../lib/dates';
import { formatRange } from '../lib/time';

export const EVENT_KINDS: { kind: EventKind; label: string; icon: LucideIcon }[] = [
  { kind: 'busy', label: 'Class or work', icon: GraduationCap },
  { kind: 'plan', label: 'Plans', icon: PartyPopper },
  { kind: 'birthday', label: 'Birthday', icon: Cake },
  { kind: 'other', label: 'Other', icon: CalendarDays },
];

/** Chip colors for an event of each kind. */
export const EVENT_CHIP: Record<EventKind, string> = {
  busy: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  plan: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  birthday: 'bg-pink-50 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300',
  other: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
};

export const EVENT_DOT: Record<EventKind, string> = {
  busy: 'bg-slate-500',
  plan: 'bg-sky-500',
  birthday: 'bg-pink-500',
  other: 'bg-violet-500',
};

export function eventIcon(event: CalendarEvent): LucideIcon {
  return EVENT_KINDS.find((k) => k.kind === eventKind(event))?.icon ?? CalendarDays;
}

/** "All day" or "2:00 PM – 3:00 PM". */
export function eventTime(event: CalendarEvent): string {
  return event.allDay ? 'All day' : formatRange(event);
}

/** "Every Tuesday", "Every year on Mar 14", or the date. */
export function eventRepeatLabel(event: CalendarEvent): string {
  const until = event.until ? ` until ${formatDate(event.until, { month: 'short', day: 'numeric' })}` : '';
  if (event.repeat === 'weekly') return `Every ${WEEKDAY_NAMES[weekdayOf(event.date)]}${until}`;
  if (event.repeat === 'yearly') return `Every year on ${formatDate(event.date, { month: 'short', day: 'numeric' })}`;
  return formatDate(event.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}
