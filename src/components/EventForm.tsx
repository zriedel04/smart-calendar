import { Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { eventBlocksWork, eventKind, type CalendarEvent, type EventKind, type EventRepeat } from '../lib/availability';
import { isISODate, type ISODate } from '../lib/dates';
import { parseTime, toTimeInputValue } from '../lib/time';
import { useStore } from '../state/context';
import type { EventDraft } from '../state/reducer';
import { cx } from './cx';
import { EVENT_KINDS } from './eventStyles';
import { inputClass } from './styles';
import { Button, Field, Modal } from './ui';

const PLACEHOLDERS: Record<EventKind, string> = {
  busy: 'e.g. Physics lecture',
  plan: 'e.g. Dinner with Sam',
  birthday: "e.g. Mom's birthday",
  other: 'e.g. Dentist',
};

const checkboxClass = 'size-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600';

/** Adds or edits something on the calendar that isn't a task: a class, plans, a birthday. */
export function EventForm({
  event,
  today,
  defaultDate,
  onClose,
}: {
  event?: CalendarEvent;
  today: ISODate;
  /** The date a new event starts on, such as the day picked on the month calendar. */
  defaultDate?: ISODate;
  onClose: () => void;
}) {
  const { dispatch } = useStore();
  const [kind, setKind] = useState<EventKind>(event ? eventKind(event) : 'busy');
  const [title, setTitle] = useState(event?.title ?? '');
  const [date, setDate] = useState(event?.date ?? defaultDate ?? today);
  const [allDay, setAllDay] = useState(event?.allDay ?? false);
  const [start, setStart] = useState(toTimeInputValue(event?.start ?? 14 * 60));
  const [end, setEnd] = useState(toTimeInputValue(event?.end ?? 15 * 60));
  const [repeat, setRepeat] = useState<EventRepeat>(event?.repeat ?? (defaultDate ? 'none' : 'weekly'));
  const [until, setUntil] = useState(event?.until ?? '');
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

  const startMin = parseTime(start);
  const endMin = parseTime(end);
  const errors = {
    title: title.trim() ? null : 'Give it a name.',
    date: isISODate(date) ? null : 'Pick a date.',
    time: allDay || (startMin !== null && endMin !== null && endMin > startMin) ? null : 'It must end after it starts.',
    until: repeat === 'none' || !until || (isISODate(until) && until >= date) ? null : 'Pick a date after the first one.',
  };

  function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (errors.title || errors.date || errors.time || errors.until) return;
    const draft: EventDraft = {
      title: title.trim(),
      date,
      // All-day events keep a valid time range so older versions of the app can still read them.
      start: allDay ? 0 : (startMin ?? 0),
      end: allDay ? 24 * 60 : (endMin ?? 0),
      repeat,
      kind,
      allDay,
      blocksWork,
      ...(repeat !== 'none' && until ? { until } : {}),
    };
    dispatch(event ? { type: 'event/update', id: event.id, draft } : { type: 'event/add', draft });
    onClose();
  }

  function remove() {
    if (!event) return;
    dispatch({ type: 'event/delete', id: event.id });
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
              <Trash2 className="size-4" /> Delete
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
            {(id) => (
              <input id={id} type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
            )}
          </Field>
          <Field label="Repeats">
            {(id) => (
              <select
                id={id}
                className={inputClass}
                value={repeat}
                onChange={(e) => setRepeat(e.target.value as EventRepeat)}
              >
                <option value="none">Doesn't repeat</option>
                <option value="weekly">Every week</option>
                <option value="yearly">Every year</option>
              </select>
            )}
          </Field>
        </div>

        {repeat !== 'none' && (
          <Field
            label="Last date (optional)"
            hint={error(errors.until) ?? (repeat === 'weekly' ? 'For example, the end of the semester.' : undefined)}
          >
            {(id) => (
              <input id={id} type="date" className={inputClass} value={until} onChange={(e) => setUntil(e.target.value)} />
            )}
          </Field>
        )}

        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
          <input type="checkbox" checked={allDay} onChange={(e) => toggleAllDay(e.target.checked)} className={checkboxClass} />
          All day
        </label>

        {!allDay && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Starts">
                {(id) => (
                  <input
                    id={id}
                    type="time"
                    step={900}
                    className={inputClass}
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                )}
              </Field>
              <Field label="Ends">
                {(id) => (
                  <input
                    id={id}
                    type="time"
                    step={900}
                    className={inputClass}
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                )}
              </Field>
            </div>
            {error(errors.time) && <p className="text-xs">{error(errors.time)}</p>}
          </>
        )}

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
              {allDay
                ? 'No work gets planned on this day.'
                : 'No work gets planned during this time.'}
            </span>
          </span>
        </label>
      </form>
    </Modal>
  );
}
