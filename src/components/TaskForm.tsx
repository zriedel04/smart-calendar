import { Repeat, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { addDays, isISODate, weekdayOf, WEEKDAY_NAMES, type ISODate, type Weekday } from '../lib/dates';
import { formatDuration } from '../lib/time';
import { useStore } from '../state/context';
import { EVERY_DAY, seriesRepeatLabel, WEEKDAYS } from '../state/recurring';
import type { SeriesDraft } from '../state/reducer';
import type { Task, TaskSeries } from '../state/types';
import { inputClass } from './styles';
import { Button, Field, Modal } from './ui';

const QUICK_ESTIMATES = [0.5, 1, 2, 4];

type RepeatChoice = 'none' | 'daily' | 'weekdays' | 'weekly' | 'custom';

function choiceFor(days: readonly Weekday[]): RepeatChoice {
  if (days.length === 7) return 'daily';
  if (days.length === 5 && WEEKDAYS.every((d) => days.includes(d))) return 'weekdays';
  if (days.length === 1) return 'weekly';
  return 'custom';
}

export function TaskForm({
  task,
  series: seriesToEdit,
  today,
  defaultDue,
  onClose,
  onAddMany,
}: {
  task?: Task;
  /** The due date a new task starts with, such as the day picked on the month calendar. */
  defaultDue?: ISODate;
  /** A repeating task to edit when there's no day's copy of it to open. */
  series?: TaskSeries;
  today: ISODate;
  onClose: () => void;
  /** Switches to adding several tasks at once. Only offered when adding a new task. */
  onAddMany?: () => void;
}) {
  const { data, dispatch } = useStore();
  // Editing one day's copy of a repeating task edits the repeating task itself.
  const series: TaskSeries | undefined =
    seriesToEdit ?? (task?.seriesId ? data.series?.find((s) => s.id === task.seriesId) : undefined);
  const source = series ?? task;
  const [title, setTitle] = useState(source?.title ?? '');
  const [dueDate, setDueDate] = useState(series?.startDate ?? task?.dueDate ?? defaultDue ?? addDays(today, 7));
  const [hours, setHours] = useState(source ? String(source.estimateMinutes / 60) : '');
  const [notes, setNotes] = useState(source?.notes ?? '');
  const [repeat, setRepeat] = useState<RepeatChoice>(series ? choiceFor(series.days) : 'none');
  const [until, setUntil] = useState(series?.until ?? '');
  const [planDate, setPlanDate] = useState(task?.planDate ?? '');
  const [submitted, setSubmitted] = useState(false);
  const repeats = repeat !== 'none';

  const estimateMinutes = Math.round(Number(hours) * 60);
  const errors = {
    title: title.trim() ? null : 'Give the task a name.',
    dueDate: isISODate(dueDate) ? null : repeats ? 'Pick the first day.' : 'Pick a due date.',
    hours: Number.isFinite(estimateMinutes) && estimateMinutes >= 5 ? null : 'Enter at least 5 minutes (0.1 hours).',
    until: !repeats || !until || (isISODate(until) && until >= dueDate) ? null : 'Pick a day after the first one.',
    planDate:
      repeats || !planDate || (isISODate(planDate) && planDate <= dueDate) ? null : 'Pick a day by the due date.',
  };
  const valid = !errors.title && !errors.dueDate && !errors.hours && !errors.until && !errors.planDate;

  function repeatDays(): Weekday[] {
    if (repeat === 'daily') return EVERY_DAY;
    if (repeat === 'weekdays') return WEEKDAYS;
    if (repeat === 'custom' && series) return series.days;
    return isISODate(dueDate) ? [weekdayOf(dueDate)] : [];
  }
  const logged = task
    ? data.logs.filter((l) => l.taskId === task.id).reduce((sum, l) => sum + l.minutes, 0)
    : 0;

  function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!valid) return;
    if (repeats) {
      const draft: SeriesDraft = {
        title: title.trim(),
        estimateMinutes,
        notes: notes.trim() || undefined,
        days: repeatDays(),
        startDate: dueDate,
        ...(until ? { until } : {}),
      };
      if (series) dispatch({ type: 'series/update', id: series.id, draft, today });
      else dispatch({ type: 'series/add', draft, today, ...(task ? { replacesTaskId: task.id } : {}) });
    } else {
      const draft = {
        title: title.trim(),
        dueDate,
        estimateMinutes,
        notes: notes.trim() || undefined,
        planDate: planDate || undefined,
      };
      dispatch(task ? { type: 'task/update', id: task.id, draft } : { type: 'task/add', draft });
    }
    onClose();
  }

  function remove() {
    if (!task) return;
    const message = series
      ? `Skip "${task.title}" on this day? It still repeats on the other days.`
      : `Delete "${task.title}"? This also removes the time you logged on it.`;
    if (window.confirm(message)) {
      dispatch(series ? { type: 'task/skip', id: task.id } : { type: 'task/delete', id: task.id });
      onClose();
    }
  }

  function stopRepeating() {
    if (!series) return;
    if (window.confirm(`Stop repeating "${series.title}"? Upcoming days you haven't started are removed.`)) {
      dispatch({ type: 'series/stop', id: series.id, today });
      onClose();
    }
  }

  const error = (message: string | null) =>
    submitted && message ? <span className="text-rose-600 dark:text-rose-400">{message}</span> : undefined;

  return (
    <Modal
      title={series ? 'Edit repeating task' : task ? 'Edit task' : 'Add a task'}
      onClose={onClose}
      footer={
        <>
          {task && (
            <Button variant="danger" onClick={remove} className="mr-auto">
              <Trash2 className="size-4" /> {series ? 'Skip this day' : 'Delete'}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="task-form">
            {task ? 'Save' : 'Add task'}
          </Button>
        </>
      }
    >
      <form id="task-form" onSubmit={submit} className="space-y-4" noValidate>
        <Field label="What do you need to do?" hint={error(errors.title)}>
          {(id) => (
            <input
              id={id}
              className={inputClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Finish chemistry lab report"
              autoComplete="off"
            />
          )}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={repeats ? 'First day' : 'Due date'} hint={error(errors.dueDate)}>
            {(id) => (
              <input
                id={id}
                type="date"
                className={inputClass}
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            )}
          </Field>
          <Field label={repeats ? 'Hours each day' : 'Estimated hours'} hint={error(errors.hours)}>
            {(id) => (
              <input
                id={id}
                type="number"
                inputMode="decimal"
                min="0.1"
                step="0.25"
                className={inputClass}
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="2"
              />
            )}
          </Field>
        </div>

        <div className="flex flex-wrap gap-2">
          {QUICK_ESTIMATES.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setHours(String(h))}
              className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-indigo-500/15 dark:hover:text-indigo-200"
            >
              {formatDuration(h * 60)}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Repeats">
            {(id) => (
              <select
                id={id}
                className={inputClass}
                value={repeat}
                onChange={(e) => {
                  const next = e.target.value as RepeatChoice;
                  // A new repeating task usually starts today, not on the default due date a week out.
                  if (!task && repeat === 'none' && next !== 'none' && dueDate === addDays(today, 7)) setDueDate(today);
                  if (!task && repeat !== 'none' && next === 'none' && dueDate === today) setDueDate(addDays(today, 7));
                  setRepeat(next);
                }}
              >
                {!series && <option value="none">Doesn't repeat</option>}
                <option value="daily">Every day</option>
                <option value="weekdays">Every weekday</option>
                <option value="weekly">
                  {isISODate(dueDate) ? `Every ${WEEKDAY_NAMES[weekdayOf(dueDate)]}` : 'Every week'}
                </option>
                {series && repeat === 'custom' && <option value="custom">{seriesRepeatLabel(series.days)}</option>}
              </select>
            )}
          </Field>
          {repeats ? (
            <Field label="Last day (optional)" hint={error(errors.until)}>
              {(id) => (
                <input id={id} type="date" className={inputClass} value={until} onChange={(e) => setUntil(e.target.value)} />
              )}
            </Field>
          ) : (
            <Field label="Work on it on (optional)" hint={error(errors.planDate)}>
              {(id) => (
                <input
                  id={id}
                  type="date"
                  className={inputClass}
                  value={planDate}
                  min={today}
                  max={isISODate(dueDate) ? dueDate : undefined}
                  onChange={(e) => setPlanDate(e.target.value)}
                />
              )}
            </Field>
          )}
        </div>

        {!repeats && planDate && !errors.planDate && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            It goes first on that day's list. Anything that doesn't fit carries on to the next days.
          </p>
        )}

        {repeats && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {series
              ? 'Changes apply to upcoming days you haven\'t started.'
              : 'Each day gets its own item on your list, planned on that day. Missed days are skipped, not piled up.'}
          </p>
        )}

        {series && (
          <button
            type="button"
            onClick={stopRepeating}
            className="flex items-center gap-1.5 text-sm font-medium text-rose-600 hover:text-rose-500 dark:text-rose-400"
          >
            <Repeat className="size-4" /> Stop repeating
          </button>
        )}

        {task && !series && logged > 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            You've logged {formatDuration(logged)} on this so far.
          </p>
        )}

        {!task && onAddMany && (
          <button
            type="button"
            onClick={onAddMany}
            className="text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-300"
          >
            Adding a lot? Add several at once
          </button>
        )}

        <Field label="Notes (optional)">
          {(id) => (
            <textarea
              id={id}
              className={inputClass}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          )}
        </Field>
      </form>
    </Modal>
  );
}
