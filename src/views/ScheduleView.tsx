import { CalendarPlus, Download, Pencil, RotateCcw, Trash2, Upload } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { eventBlocksWork, type CalendarEvent } from '../lib/availability';
import { formatDate, WEEKDAY_NAMES, WEEKDAYS_MONDAY_FIRST, weekdayOf, type ISODate } from '../lib/dates';
import { formatDuration, formatRange, normalizeRanges, totalMinutes } from '../lib/time';
import { AccountCard } from '../components/AccountCard';
import { CalendarLinksCard } from '../components/CalendarLinksCard';
import { HoursEditor } from '../components/HoursEditor';
import { eventRepeatLabel, eventTime } from '../components/eventStyles';
import { cx } from '../components/cx';
import { inputClass } from '../components/styles';
import { Button, Card, CardHeader, EventIcon, Modal } from '../components/ui';
import { useSync } from '../sync/context';
import { useStore } from '../state/context';
import { parseAppData } from '../state/storage';
import { useShowHolidays } from '../state/preferences';
import { holidaysInYear } from '../lib/holidays';

export function ScheduleView({
  today,
  onEditDay,
  onEditEvent,
  onImport,
  onLoadSample,
}: {
  today: ISODate;
  onEditDay: (date?: ISODate) => void;
  onEditEvent: (event?: CalendarEvent) => void;
  onImport: () => void;
  onLoadSample: () => void;
}) {
  const { data, dispatch } = useStore();
  const fileInput = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const upcomingOverrides = Object.entries(data.overrides)
    .filter(([date]) => date >= today)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  const weeklyTotal = data.weeklyHours.reduce((sum, r) => sum + totalMinutes(normalizeRanges(r)), 0);

  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `smart-calendar-backup-${today}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importData(file: File) {
    setImportError(null);
    try {
      const imported = parseAppData(await file.text());
      if (window.confirm('Replace everything in this browser with the data from this file?')) {
        dispatch({ type: 'data/replace', data: imported });
      }
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'That file could not be read.');
    }
  }


  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">Schedule</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Your work hours decide how much lands on each day's list.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Usual weekly hours"
          description={`The hours you can usually work. ${formatDuration(weeklyTotal)} a week in total.`}
        />
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {WEEKDAYS_MONDAY_FIRST.map((weekday) => {
            const ranges = data.weeklyHours[weekday] ?? [];
            const total = totalMinutes(normalizeRanges(ranges));
            return (
              <li key={weekday} className="grid gap-2 py-3 sm:grid-cols-[7rem_1fr] sm:gap-4">
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">{WEEKDAY_NAMES[weekday]}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{total ? formatDuration(total) : 'Off'}</p>
                </div>
                <HoursEditor
                  label={WEEKDAY_NAMES[weekday]}
                  ranges={ranges}
                  onChange={(next) => dispatch({ type: 'hours/setWeekday', weekday, ranges: next })}
                />
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <CardHeader
          title="One-day changes"
          description="Different hours for a single date. Your usual hours stay the same for other weeks."
          action={
            <Button size="sm" onClick={() => onEditDay()}>
              <CalendarPlus className="size-4" /> Change a date
            </Button>
          }
        />
        {upcomingOverrides.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No upcoming changes.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {upcomingOverrides.map(([date, ranges]) => (
              <li key={date} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900 dark:text-white">
                    {formatDate(date, { weekday: 'long', month: 'short', day: 'numeric' })}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {ranges.length ? ranges.map(formatRange).join(', ') : 'Day off'}
                    <span className="text-slate-400">
                      {' '}
                      · usually{' '}
                      {(data.weeklyHours[weekdayOf(date)] ?? []).length
                        ? normalizeRanges(data.weeklyHours[weekdayOf(date)] ?? [])
                            .map(formatRange)
                            .join(', ')
                        : 'off'}
                    </span>
                  </p>
                </div>
                <Button size="sm" variant="ghost" aria-label="Edit" onClick={() => onEditDay(date)}>
                  <Pencil className="size-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => dispatch({ type: 'hours/clearOverride', date })}
                  title="Go back to usual hours"
                >
                  <RotateCcw className="size-4" /> Reset
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Events"
          description="Classes, shifts, plans and birthdays. Events that take time away from work are left out of your work hours."
          action={
            <Button size="sm" onClick={onImport}>
              <CalendarPlus className="size-4" /> Import .ics
            </Button>
          }
        />
        {data.events.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No events yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.events.map((event) => (
              <li key={event.id}>
                <button
                  type="button"
                  onClick={() => onEditEvent(event)}
                  className="flex w-full items-center gap-3 py-2.5 text-left"
                >
                  <EventIcon event={event} className="size-4 text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-900 dark:text-white">{event.title}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {eventRepeatLabel(event)} · {eventTime(event)}
                      {!eventBlocksWork(event) && event.kind !== 'birthday' && ' · Doesn’t block work'}
                    </p>
                  </div>
                  <Pencil className="size-4 text-slate-400" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <HolidaysCard today={today} />
      <AccountCard />
      <CalendarLinksCard />

      <Card>
        <CardHeader
          title="Your data"
          description="Your calendar is saved in this browser. Export a backup to keep a copy as a file."
        />
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportData}>
            <Download className="size-4" /> Export backup
          </Button>
          <Button onClick={() => fileInput.current?.click()}>
            <Upload className="size-4" /> Import backup
          </Button>
          <Button variant="ghost" onClick={onLoadSample}>
            Load sample tasks
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importData(file);
              e.target.value = '';
            }}
          />
        </div>
        {importError && <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{importError}</p>}
      </Card>

      <DangerZone />
    </div>
  );
}

/** The switch for showing US holidays, with the next few coming up. */
function HolidaysCard({ today }: { today: ISODate }) {
  const [show, setShow] = useShowHolidays();
  const year = Number(today.slice(0, 4));
  const upcoming = [...holidaysInYear(year), ...holidaysInYear(year + 1)].filter((h) => h.date >= today).slice(0, 3);
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">US holidays</h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Shown on your calendar. They don’t change your work hours; to take one off, change that day’s hours.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={show}
          aria-label="Show US holidays"
          onClick={() => setShow(!show)}
          className={cx(
            'relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors',
            show ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700',
          )}
        >
          <span
            className={cx(
              'inline-block size-5 rounded-full bg-white shadow transition-transform',
              show ? 'translate-x-6' : 'translate-x-1',
            )}
          />
        </button>
      </div>
      {show && upcoming.length > 0 && (
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          Coming up:{' '}
          {upcoming.map((h) => `${h.name} (${formatDate(h.date, { month: 'short', day: 'numeric' })})`).join(', ')}
        </p>
      )}
    </Card>
  );
}

const CONFIRM_WORD = 'delete';

/** Deleting the whole calendar, behind a dialog where you type a word, so it can't happen by a stray click. */
function DangerZone() {
  const { data, dispatch } = useStore();
  const { email } = useSync();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  // Stable, so the dialog doesn't move focus out of the box on each keystroke.
  const close = useCallback(() => {
    setOpen(false);
    setTyped('');
  }, []);
  const counts = [
    `${data.tasks.length} ${data.tasks.length === 1 ? 'task' : 'tasks'}`,
    `${data.events.length} ${data.events.length === 1 ? 'event' : 'events'}`,
    ...(data.feeds?.length ? [`${data.feeds.length} calendar ${data.feeds.length === 1 ? 'link' : 'links'}`] : []),
  ];
  return (
    <Card className="border-rose-200 dark:border-rose-500/30">
      <CardHeader
        title="Danger zone"
        description="Delete everything on your calendar: tasks, logged work, events, repeating tasks and calendar links. Your weekly work hours stay."
      />
      <Button variant="danger" onClick={() => setOpen(true)}>
        <Trash2 className="size-4" /> Delete my calendar
      </Button>
      {open && (
        <Modal
          title="Delete your whole calendar?"
          onClose={close}
          footer={
            <>
              <Button variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={typed.trim().toLowerCase() !== CONFIRM_WORD}
                onClick={() => {
                  dispatch({ type: 'data/clear' });
                  close();
                }}
              >
                Delete everything
              </Button>
            </>
          }
        >
          <p className="text-sm text-slate-600 dark:text-slate-300">
            This deletes {counts.length > 1 ? `${counts.slice(0, -1).join(', ')} and ${counts.at(-1)}` : counts[0]}
            {email ? ', on every device signed in to your account' : ''}. You can undo it right after, but not later.
          </p>
          <label htmlFor="confirm-delete" className="mt-4 mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
            Type <span className="font-mono font-semibold">{CONFIRM_WORD}</span> to confirm
          </label>
          <input
            id="confirm-delete"
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className={cx(inputClass, 'w-full')}
          />
        </Modal>
      )}
    </Card>
  );
}
