import { Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { addDays, isISODate, type ISODate } from '../lib/dates';
import { formatDuration } from '../lib/time';
import { useStore } from '../state/context';
import type { Task } from '../state/types';
import { inputClass } from './styles';
import { Button, Field, Modal } from './ui';

const QUICK_ESTIMATES = [0.5, 1, 2, 4];

export function TaskForm({
  task,
  today,
  onClose,
  onAddMany,
}: {
  task?: Task;
  today: ISODate;
  onClose: () => void;
  /** Switches to adding several tasks at once. Only offered when adding a new task. */
  onAddMany?: () => void;
}) {
  const { data, dispatch } = useStore();
  const [title, setTitle] = useState(task?.title ?? '');
  const [dueDate, setDueDate] = useState(task?.dueDate ?? addDays(today, 7));
  const [hours, setHours] = useState(task ? String(task.estimateMinutes / 60) : '');
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [submitted, setSubmitted] = useState(false);

  const estimateMinutes = Math.round(Number(hours) * 60);
  const errors = {
    title: title.trim() ? null : 'Give the task a name.',
    dueDate: isISODate(dueDate) ? null : 'Pick a due date.',
    hours: Number.isFinite(estimateMinutes) && estimateMinutes >= 5 ? null : 'Enter at least 5 minutes (0.1 hours).',
  };
  const valid = !errors.title && !errors.dueDate && !errors.hours;
  const logged = task
    ? data.logs.filter((l) => l.taskId === task.id).reduce((sum, l) => sum + l.minutes, 0)
    : 0;

  function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!valid) return;
    const draft = { title: title.trim(), dueDate, estimateMinutes, notes: notes.trim() || undefined };
    dispatch(task ? { type: 'task/update', id: task.id, draft } : { type: 'task/add', draft });
    onClose();
  }

  function remove() {
    if (!task) return;
    if (window.confirm(`Delete "${task.title}"? This also removes the time you logged on it.`)) {
      dispatch({ type: 'task/delete', id: task.id });
      onClose();
    }
  }

  const error = (message: string | null) =>
    submitted && message ? <span className="text-rose-600 dark:text-rose-400">{message}</span> : undefined;

  return (
    <Modal
      title={task ? 'Edit task' : 'Add a task'}
      onClose={onClose}
      footer={
        <>
          {task && (
            <Button variant="danger" onClick={remove} className="mr-auto">
              <Trash2 className="size-4" /> Delete
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
          <Field label="Due date" hint={error(errors.dueDate)}>
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
          <Field label="Estimated hours" hint={error(errors.hours)}>
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

        {task && logged > 0 && (
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
