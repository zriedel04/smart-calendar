import { CalendarPlus, FileUp } from 'lucide-react';
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { formatDate, type ISODate } from '../lib/dates';
import { parseIcs } from '../lib/ics';
import { formatRange } from '../lib/time';
import { useStore } from '../state/context';
import { planImport, toEventDrafts, toTaskDraft, type ImportAs, type ImportRow } from '../state/calendarImport';
import type { EventDraft, TaskDraft } from '../state/reducer';
import { cx } from './cx';
import { inputClass } from './styles';
import { Button, Modal } from './ui';

interface Row extends ImportRow {
  key: string;
  hours: string;
}

const minutesOf = (hours: string) => Math.round(Number(hours) * 60);
const validHours = (hours: string) => hours.trim() !== '' && Number.isFinite(minutesOf(hours)) && minutesOf(hours) >= 5;

function whenLabel(row: Row): string {
  const { entry } = row;
  const date = formatDate(entry.date, { weekday: 'short', month: 'short', day: 'numeric' });
  if (row.as === 'task') return `Due ${date}`;
  const repeat = { none: '', weekly: 'Weekly from ', monthly: 'Monthly from ', yearly: 'Yearly from ' }[entry.repeat];
  const span =
    entry.allDay && entry.endDate > entry.date
      ? ` to ${formatDate(entry.endDate, { month: 'short', day: 'numeric' })}`
      : '';
  return `${repeat}${date}${span} · ${entry.allDay ? 'All day' : formatRange(entry)}`;
}

/** Imports an .ics file from Canvas, Google Calendar, Apple Calendar or Outlook, with a preview to adjust first. */
export function ImportCalendarDialog({ today, onClose }: { today: ISODate; onClose: () => void }) {
  const { data, dispatch } = useStore();
  const fileInput = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [showSkipped, setShowSkipped] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const entries = parseIcs(await file.text());
    if (entries.length === 0) {
      setFileError("That file doesn't have any calendar entries. Make sure it's an .ics file.");
      return;
    }
    setFileError(null);
    setSubmitted(false);
    setRows(
      planImport(entries, data, today).map((row, i) => ({ ...row, key: `${row.entry.uid}-${row.entry.date}-${i}`, hours: '' })),
    );
  }

  const update = (key: string, patch: Partial<Row>) =>
    setRows((current) => current && current.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const tasks = rows?.filter((r) => r.as === 'task') ?? [];
  const events = rows?.filter((r) => r.as === 'event') ?? [];
  const skipped = rows?.filter((r) => r.as === 'skip') ?? [];
  const missingHours = tasks.filter((r) => !validHours(r.hours));
  // Rows the import itself skipped stay hidden unless asked for; rows you switch to Skip stay in view.
  const visible = rows?.filter((r) => showSkipped || r.as !== 'skip' || !r.skipReason) ?? [];
  const hiddenCount = (rows?.length ?? 0) - visible.length;

  function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!rows || missingHours.length > 0 || tasks.length + events.length === 0) return;
    const taskDrafts: TaskDraft[] = tasks.map((r) => toTaskDraft(r.entry, minutesOf(r.hours)));
    const eventDrafts: EventDraft[] = events.flatMap((r) => toEventDrafts(r.entry));
    dispatch({ type: 'import/add', tasks: taskDrafts, events: eventDrafts });
    onClose();
  }

  const summary = [
    tasks.length > 0 && `${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`,
    events.length > 0 && `${events.length} ${events.length === 1 ? 'event' : 'events'}`,
  ]
    .filter(Boolean)
    .join(' and ');

  return (
    <Modal
      title="Import a calendar"
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {rows && (
            <Button variant="primary" type="submit" form="import-form" disabled={tasks.length + events.length === 0}>
              {summary ? `Import ${summary}` : 'Nothing to import'}
            </Button>
          )}
        </>
      }
    >
      <input
        ref={fileInput}
        type="file"
        accept=".ics,text/calendar"
        className="hidden"
        onChange={onFile}
        aria-label="Calendar file"
        data-testid="ics-file"
      />

      {!rows ? (
        <div className="space-y-4 text-sm text-slate-600 dark:text-slate-300">
          <p>Bring in assignments from Canvas, or classes, plans and birthdays from another calendar. You'll see everything before it's added.</p>
          <Button variant="primary" onClick={() => fileInput.current?.click()}>
            <FileUp className="size-4" /> Choose an .ics file
          </Button>
          {fileError && <p className="text-rose-600 dark:text-rose-400">{fileError}</p>}
          <div className="space-y-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
            <p className="font-medium text-slate-800 dark:text-slate-100">Where to get the file</p>
            <p>
              <strong>Canvas:</strong> open Calendar, click <em>Calendar Feed</em>, and open the link in your browser to download the file.
            </p>
            <p>
              <strong>Google Calendar:</strong> Settings, then <em>Import &amp; export</em>, then <em>Export</em>. Unzip the download.
            </p>
            <p>
              <strong>Apple Calendar:</strong> File, then <em>Export</em>.
            </p>
          </div>
        </div>
      ) : (
        <form id="import-form" onSubmit={submit} className="space-y-3" noValidate>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Assignments come in as tasks: add how many hours each will take. Everything else comes in as an event. Change
            any row before importing.
          </p>
          {submitted && missingHours.length > 0 && (
            <p className="text-sm text-rose-600 dark:text-rose-400">
              Add hours for {missingHours.length === 1 ? 'the highlighted task' : `the ${missingHours.length} highlighted tasks`}, or skip them.
            </p>
          )}

          {visible.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
              Everything in this file is already in your calendar or already over.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200 dark:divide-slate-800 dark:ring-slate-800">
              {visible.map((row) => {
                const needsHours = submitted && row.as === 'task' && !validHours(row.hours);
                return (
                  <li key={row.key} className={cx('flex flex-wrap items-center gap-x-3 gap-y-2 p-2.5', row.as === 'skip' && 'opacity-60')}>
                    <div className="min-w-0 flex-1 basis-48">
                      <p className={cx('truncate text-sm font-medium text-slate-900 dark:text-white', row.as === 'skip' && 'line-through')}>
                        {row.entry.title}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {whenLabel(row)}
                        {row.skipReason === 'duplicate' && ' · Already imported'}
                        {row.skipReason === 'past' && ' · Already over'}
                      </p>
                    </div>
                    <div className="w-24 shrink-0">
                      <select
                        aria-label={`Import "${row.entry.title}" as`}
                        value={row.as}
                        onChange={(e) => update(row.key, { as: e.target.value as ImportAs })}
                        className={cx(inputClass, 'py-1.5')}
                      >
                        <option value="task">Task</option>
                        <option value="event">Event</option>
                        <option value="skip">Skip</option>
                      </select>
                    </div>
                    <div className="w-20 shrink-0">
                      {row.as === 'task' && (
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0.1"
                          step="0.25"
                          placeholder="Hours"
                          aria-label={`Hours for "${row.entry.title}"`}
                          aria-invalid={needsHours || undefined}
                          value={row.hours}
                          onChange={(e) => update(row.key, { hours: e.target.value })}
                          className={cx(inputClass, 'py-1.5', needsHours && 'ring-2 ring-rose-500')}
                        />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            {hiddenCount > 0 || (showSkipped && skipped.some((r) => r.skipReason)) ? (
              <button
                type="button"
                onClick={() => setShowSkipped(!showSkipped)}
                className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-300"
              >
                {showSkipped ? 'Hide skipped entries' : `Show ${hiddenCount} skipped (already over or imported)`}
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex items-center gap-1 font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400"
            >
              <CalendarPlus className="size-4" /> Choose a different file
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
