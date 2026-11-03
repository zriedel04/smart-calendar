import { Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { CalendarEvent } from '../lib/availability';
import { isISODate, type ISODate } from '../lib/dates';
import { parseTime, toTimeInputValue } from '../lib/time';
import { useStore } from '../state/context';
import { inputClass } from './styles';
import { Button, Field, Modal } from './ui';

/** Adds or edits a fixed event, like a class or a shift, which blocks work time. */
export function EventForm({
  event,
  today,
  onClose,
}: {
  event?: CalendarEvent;
  today: ISODate;
  onClose: () => void;
}) {
  const { dispatch } = useStore();
  const [title, setTitle] = useState(event?.title ?? '');
  const [date, setDate] = useState(event?.date ?? today);
  const [start, setStart] = useState(toTimeInputValue(event?.start ?? 14 * 60));
  const [end, setEnd] = useState(toTimeInputValue(event?.end ?? 15 * 60));
  const [weekly, setWeekly] = useState(event ? event.repeat === 'weekly' : true);
  const [submitted, setSubmitted] = useState(false);

  const startMin = parseTime(start);
  const endMin = parseTime(end);
  const errors = {
    title: title.trim() ? null : 'Give the event a name.',
    date: isISODate(date) ? null : 'Pick a date.',
    time: startMin !== null && endMin !== null && endMin > startMin ? null : 'The event must end after it starts.',
  };

  function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (errors.title || errors.date || errors.time || startMin === null || endMin === null) return;
    const draft = {
      title: title.trim(),
      date,
      start: startMin,
      end: endMin,
      repeat: weekly ? ('weekly' as const) : ('none' as const),
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
      title={event ? 'Edit event' : 'Add a fixed event'}
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
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Fixed events, like classes or shifts, are taken out of your work hours.
        </p>
        <Field label="Name" hint={error(errors.title)}>
          {(id) => (
            <input
              id={id}
              className={inputClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Physics lecture"
              autoComplete="off"
            />
          )}
        </Field>
        <Field label={weekly ? 'First date' : 'Date'} hint={error(errors.date)}>
          {(id) => (
            <input
              id={id}
              type="date"
              className={inputClass}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          )}
        </Field>
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
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
          <input
            type="checkbox"
            checked={weekly}
            onChange={(e) => setWeekly(e.target.checked)}
            className="size-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
          />
          Repeats every week
        </label>
      </form>
    </Modal>
  );
}
