import { MapPin, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
  eventBlocksWork,
  eventExtraDays,
  eventKind,
  MAX_EVENT_DAYS,
  REPEAT_RULES,
  type CalendarEvent,
  type EventKind,
  type EventRepeat,
  type RepeatRule,
} from '../lib/availability';
import { addDays, daysBetween, formatDate, isISODate, WEEKDAY_NAMES, weekdayOf, type ISODate } from '../lib/dates';
import { parseTime, toTimeInputValue } from '../lib/time';
import { useStore } from '../state/context';
import type { EventDraft } from '../state/reducer';
import { cx } from './cx';
import { EVENT_KINDS, mapsUrl, nthWeekdayLabel, ordinal } from './eventStyles';
import { inputClass } from './styles';
import { Button, Field, Modal } from './ui';

const PLACEHOLDERS: Record<EventKind, string> = {
  busy: 'e.g. Physics lecture',
  plan: 'e.g. Dinner with Sam',
  birthday: "e.g. Mom's birthday",
  other: 'e.g. Dentist',
};

/** One choice in the Repeats menu: a plain repeat, or a finer rule stored beside it. */
type RepeatChoice = EventRepeat | RepeatRule;

const RULE_BASE: Record<RepeatRule, EventRepeat> = {
  daily: 'weekly',
  weekdays: 'weekly',
  biweekly: 'weekly',
  monthlyWeekday: 'monthly',
};

function choiceOf(event: CalendarEvent): RepeatChoice {
  return event.rule && REPEAT_RULES.includes(event.rule) ? event.rule : event.repeat;
}

const checkboxClass = 'size-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600';

/** Adds or edits something on the calendar that isn't a task: a class, plans, a birthday. */
export function EventForm({
  event,
  today,
  defaultDate,
  occurrence,
  onClose,
}: {
  event?: CalendarEvent;
  /** The day of a repeating event it was opened from, so just that day can be changed or cancelled. */
  occurrence?: ISODate;
  today: ISODate;
  /** The date a new event starts on, such as the day picked on the month calendar. */
  defaultDate?: ISODate;
  onClose: () => void;
}) {
  const { dispatch } = useStore();
  const [kind, setKind] = useState<EventKind>(event ? eventKind(event) : 'busy');
  const [title, setTitle] = useState(event?.title ?? '');
  // Opened from one day of a repeating event, changes go to that day unless you pick every day.
  const canPickDay = Boolean(event && event.repeat !== 'none' && occurrence);
  const [scope, setScope] = useState<'day' | 'all'>(canPickDay ? 'day' : 'all');
  const oneDay = canPickDay && scope === 'day';
  const [seriesDate, setSeriesDate] = useState(event?.date ?? defaultDate ?? today);
  const [dayDate, setDayDate] = useState(occurrence ?? today);
  const date = oneDay ? dayDate : seriesDate;
  const setDate = oneDay ? setDayDate : setSeriesDate;
  const [allDay, setAllDay] = useState(event?.allDay ?? false);
  const [start, setStart] = useState(toTimeInputValue(event?.start ?? 14 * 60));
  const [end, setEnd] = useState(toTimeInputValue(event?.end ?? 15 * 60));
  const [seriesRepeat, setRepeat] = useState<RepeatChoice>(event ? choiceOf(event) : defaultDate ? 'none' : 'weekly');
  const repeat: RepeatChoice = oneDay ? 'none' : seriesRepeat;
  const [until, setUntil] = useState(event?.until ?? '');
  const [seriesEnd, setSeriesEnd] = useState(event?.allDay && event.endDate ? event.endDate : '');
  // The day's run lasts as long as the event's runs do.
  const [dayEnd, setDayEnd] = useState(
    event && occurrence && event.allDay && event.endDate ? addDays(occurrence, eventExtraDays(event)) : '',
  );
  const endDate = oneDay ? dayEnd : seriesEnd;
  const setEndDate = oneDay ? setDayEnd : setSeriesEnd;
  const [location, setLocation] = useState(event?.location ?? '');
  const [notes, setNotes] = useState(event?.notes ?? '');
  const [blocksWork, setBlocksWork] = useState(event ? eventBlocksWork(event) : true);
  const [submitted, setSubmitted] = useState(false);

  function pickKind(next: EventKind) {
    setKind(next);
    if (event) return;
    // Sensible starting points for a new event. Everything can still be changed.
    if (next === 'birthday') {
      setAllDay(true);
      setRepeat('yearly');
      setBlocksWork(false);
    } else if (next === 'busy') {
      setAllDay(false);
      setBlocksWork(true);
    } else if (next === 'plan') {
      setRepeat('none');
    }
  }

  function toggleAllDay(next: boolean) {
    setAllDay(next);
    // A whole-day event doesn't take the day off unless you say so; a timed one blocks its time by default.
    setBlocksWork(!next);
  }

  const weekday = isISODate(date) ? WEEKDAY_NAMES[weekdayOf(date)] : null;
  const startMin = parseTime(start);
  const endMin = parseTime(end);
  const errors = {
    title: title.trim() ? null : 'Give it a name.',
    date: isISODate(date) ? null : 'Pick a date.',
    time: allDay || (startMin !== null && endMin !== null && endMin > startMin) ? null : 'It must end after it starts.',
    until: repeat === 'none' || !until || (isISODate(until) && until >= date) ? null : 'Pick a date after the first one.',
    endDate:
      !allDay || !endDate
        ? null
        : !isISODate(endDate) || endDate < date
          ? 'Pick a day on or after the first one.'
          : isISODate(date) && daysBetween(date, endDate) >= MAX_EVENT_DAYS
            ? `An event can run up to ${MAX_EVENT_DAYS} days.`
            : null,
  };

  function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (errors.title || errors.date || errors.time || errors.until || errors.endDate) return;
    const rule = REPEAT_RULES.includes(repeat as RepeatRule) ? (repeat as RepeatRule) : undefined;
    const draft: EventDraft = {
      title: title.trim(),
      date,
      ...(allDay && endDate && endDate > date ? { endDate } : {}),
      ...(location.trim() ? { location: location.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      // All-day events keep a valid time range so older versions of the app can still read them.
      start: allDay ? 0 : (startMin ?? 0),
      end: allDay ? 24 * 60 : (endMin ?? 0),
      repeat: rule ? RULE_BASE[rule] : (repeat as EventRepeat),
      ...(rule ? { rule } : {}),
      kind,
      allDay,
      blocksWork,
      ...(repeat !== 'none' && until ? { until } : {}),
    };
    if (event && oneDay) dispatch({ type: 'event/changeDay', id: event.id, date: occurrence!, draft });
    else dispatch(event ? { type: 'event/update', id: event.id, draft } : { type: 'event/add', draft });
    onClose();
  }

  function remove() {
    if (!event) return;
    dispatch(oneDay ? { type: 'event/skipDay', id: event.id, date: occurrence! } : { type: 'event/delete', id: event.id });
    onClose();
  }

  const error = (message: string | null) =>
    submitted && message ? <span className="text-rose-600 dark:text-rose-400">{message}</span> : undefined;

  return (
    <Modal
      title={event ? 'Edit event' : 'Add to your calendar'}
      onClose={onClose}
      footer={
        <>
          {event && (
            <Button variant="danger" onClick={remove} className="mr-auto">
              <Trash2 className="size-4" /> {oneDay ? 'Delete this day' : 'Delete'}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="event-form">
            {event ? 'Save' : 'Add event'}
          </Button>
        </>
      }
    >
      <form id="event-form" onSubmit={submit} className="space-y-4" noValidate>
        {canPickDay && (
          <div
            role="radiogroup"
            aria-label="Which days to change"
            className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800"
          >
            {(
              [
                ['day', `Only ${formatDate(occurrence!, { weekday: 'short', month: 'short', day: 'numeric' })}`],
                ['all', 'Every day it repeats'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={scope === value}
                onClick={() => setScope(value)}
                className={cx(
                  'rounded-md px-2 py-1.5 text-sm font-medium',
                  scope === value
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <div role="radiogroup" aria-label="Kind of event" className="flex flex-wrap gap-2">
          {EVENT_KINDS.map(({ kind: k, label, icon: Icon }) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => pickKind(k)}
              className={cx(
                'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset',
                kind === k
                  ? 'bg-indigo-600 text-white ring-indigo-600'
                  : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800',
              )}
            >
              <Icon className="size-4" aria-hidden /> {label}
            </button>
          ))}
        </div>

        <Field label="Name" hint={error(errors.title)}>
          {(id) => (
            <input
              id={id}
              className={inputClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={PLACEHOLDERS[kind]}
              autoComplete="off"
            />
          )}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={repeat === 'none' ? 'Date' : 'First date'} hint={error(errors.date)}>
            {(id) => <input id={id} type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />}
          </Field>
          {!oneDay && (
            <Field label="Repeats">
              {(id) => (
                <select id={id} className={inputClass} value={seriesRepeat} onChange={(e) => setRepeat(e.target.value as RepeatChoice)}>
                  <option value="none">Doesn't repeat</option>
                  <option value="daily">Every day</option>
                  <option value="weekdays">Every weekday</option>
                  <option value="weekly">Every week{weekday ? ` on ${weekday}` : ''}</option>
                  <option value="biweekly">Every 2 weeks</option>
                  <option value="monthly">Every month{isISODate(date) ? ` on the ${ordinal(Number(date.slice(8)))}` : ''}</option>
                  {isISODate(date) && <option value="monthlyWeekday">Every month on the {nthWeekdayLabel(date)}</option>}
                  <option value="yearly">Every year</option>
                </select>
              )}
            </Field>
          )}
        </div>

        {repeat !== 'none' && (
          <Field
            label="Stops repeating after (optional)"
            hint={error(errors.until) ?? (repeat !== 'yearly' ? 'For example, the end of the semester.' : undefined)}
          >
            {(id) => <input id={id} type="date" className={inputClass} value={until} onChange={(e) => setUntil(e.target.value)} />}
          </Field>
        )}

        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
          <input type="checkbox" checked={allDay} onChange={(e) => toggleAllDay(e.target.checked)} className={checkboxClass} />
          All day
        </label>

        {allDay && (
          <Field label="Last day (optional)" hint={error(errors.endDate) ?? 'For a trip or anything else that runs several days.'}>
            {(id) => (
              <input id={id} type="date" className={inputClass} value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} />
            )}
          </Field>
        )}

        {!allDay && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Starts">
                {(id) => (
                  <input id={id} type="time" step={900} className={inputClass} value={start} onChange={(e) => setStart(e.target.value)} />
                )}
              </Field>
              <Field label="Ends">
                {(id) => (
                  <input id={id} type="time" step={900} className={inputClass} value={end} onChange={(e) => setEnd(e.target.value)} />
                )}
              </Field>
            </div>
            {error(errors.time) && <p className="text-xs">{error(errors.time)}</p>}
          </>
        )}

        <Field
          label="Location (optional)"
          hint={
            location.trim() ? (
              <a
                href={mapsUrl(location.trim())}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-indigo-600 dark:text-indigo-300"
              >
                <MapPin className="size-3.5" aria-hidden /> Open in Maps
              </a>
            ) : undefined
          }
        >
          {(id) => (
            <input
              id={id}
              className={inputClass}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Coor Hall 170"
              autoComplete="off"
            />
          )}
        </Field>

        <Field label="Notes (optional)">
          {(id) => <textarea id={id} rows={2} className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />}
        </Field>

        <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
          <input
            type="checkbox"
            checked={blocksWork}
            onChange={(e) => setBlocksWork(e.target.checked)}
            className={cx(checkboxClass, 'mt-0.5')}
          />
          <span>
            {allDay ? 'Take the day off from work' : 'Takes time away from work'}
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              {allDay ? 'No work gets planned on this day.' : 'No work gets planned during this time.'}
            </span>
          </span>
        </label>
      </form>
    </Modal>
  );
}
