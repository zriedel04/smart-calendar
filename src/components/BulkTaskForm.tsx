import { Plus, X } from 'lucide-react';
import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { addDays, isISODate, type ISODate } from '../lib/dates';
import { useStore } from '../state/context';
import { cx } from './cx';
import { inputClass } from './styles';
import { Button, Modal } from './ui';

interface Row {
  id: number;
  title: string;
  dueDate: ISODate;
  hours: string;
}

/** Adds several tasks in one go: one row per task. */
export function BulkTaskForm({ today, onClose }: { today: ISODate; onClose: () => void }) {
  const { dispatch } = useStore();
  const defaultDue = addDays(today, 7);
  const [rows, setRows] = useState<Row[]>(() =>
    [0, 1, 2].map((id) => ({ id, title: '', dueDate: defaultDue, hours: '' })),
  );
  const [submitted, setSubmitted] = useState(false);

  const update = (id: number, patch: Partial<Row>) =>
    setRows((current) => current.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const addRow = () =>
    setRows((current) => {
      const last = current[current.length - 1];
      // New rows copy the previous due date, since batches often share one.
      return [...current, { id: (last?.id ?? 0) + 1, title: '', dueDate: last?.dueDate ?? defaultDue, hours: '' }];
    });

  const minutesOf = (row: Row) => Math.round(Number(row.hours) * 60);
  const isFilled = (row: Row) => row.title.trim() !== '';
  const rowError = (row: Row) =>
    !isFilled(row) ? null : !isISODate(row.dueDate) ? 'date' : !(minutesOf(row) >= 5) ? 'hours' : null;

  const filled = rows.filter(isFilled);
  const hasErrors = filled.some((r) => rowError(r));

  function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (filled.length === 0 || hasErrors) return;
    for (const row of filled) {
      dispatch({
        type: 'task/add',
        draft: { title: row.title.trim(), dueDate: row.dueDate, estimateMinutes: minutesOf(row) },
      });
    }
    onClose();
  }

  // Enter in the last row's hours adds another row instead of submitting.
  function onHoursKey(e: KeyboardEvent<HTMLInputElement>, index: number) {
    if (e.key === 'Enter' && index === rows.length - 1) {
      e.preventDefault();
      addRow();
    }
  }

  return (
    <Modal
      title="Add several tasks"
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="bulk-task-form">
            {filled.length > 1 ? `Add ${filled.length} tasks` : 'Add task'}
          </Button>
        </>
      }
    >
      <form id="bulk-task-form" onSubmit={submit} className="space-y-3" noValidate>
        <div className="grid grid-cols-[1fr_8.5rem_4rem_1.75rem] gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
          <span>Task</span>
          <span>Due</span>
          <span>Hours</span>
          <span />
        </div>
        {rows.map((row, index) => {
          const error = submitted ? rowError(row) : null;
          return (
            <div key={row.id} className="grid grid-cols-[1fr_8.5rem_4rem_1.75rem] items-center gap-2">
              <input
                className={cx(inputClass, 'px-2')}
                aria-label={`Task ${index + 1} name`}
                placeholder={index === 0 ? 'e.g. Read chapter 4' : ''}
                value={row.title}
                onChange={(e) => update(row.id, { title: e.target.value })}
                autoComplete="off"
              />
              <input
                type="date"
                className={cx(inputClass, 'px-2', error === 'date' && 'ring-rose-400')}
                aria-label={`Task ${index + 1} due date`}
                value={row.dueDate}
                onChange={(e) => update(row.id, { dueDate: e.target.value })}
              />
              <input
                type="number"
                inputMode="decimal"
                min="0.1"
                step="0.25"
                className={cx(inputClass, 'px-2', error === 'hours' && 'ring-rose-400')}
                aria-label={`Task ${index + 1} hours`}
                placeholder="2"
                value={row.hours}
                onChange={(e) => update(row.id, { hours: e.target.value })}
                onKeyDown={(e) => onHoursKey(e, index)}
              />
              <button
                type="button"
                onClick={() => setRows((current) => (current.length > 1 ? current.filter((r) => r.id !== row.id) : current))}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600 dark:hover:bg-slate-800"
                aria-label={`Remove task ${index + 1}`}
              >
                <X className="size-4" />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-300"
        >
          <Plus className="size-4" /> Add another row
        </button>
        {submitted && filled.length === 0 && (
          <p className="text-sm text-rose-600 dark:text-rose-400">Fill in at least one task.</p>
        )}
        {submitted && hasErrors && (
          <p className="text-sm text-rose-600 dark:text-rose-400">Each task needs a due date and at least 0.1 hours.</p>
        )}
        <p className="text-xs text-slate-500 dark:text-slate-400">Empty rows are skipped.</p>
      </form>
    </Modal>
  );
}
