import { CalendarPlus, Download, Pencil, Plus, RotateCcw, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { eventBlocksWork, type CalendarEvent } from '../lib/availability';
import { formatDate, WEEKDAY_NAMES, WEEKDAYS_MONDAY_FIRST, weekdayOf, type ISODate } from '../lib/dates';
import { formatDuration, formatRange, normalizeRanges, totalMinutes } from '../lib/time';
import { HoursEditor } from '../components/HoursEditor';
import { eventRepeatLabel, eventTime } from '../components/eventStyles';
import { Button, Card, CardHeader, EventIcon } from '../components/ui';
import { useStore } from '../state/context';
import { createEmptyData } from '../state/defaults';
import { parseAppData } from '../state/storage';

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

  function eraseAll() {
    if (window.confirm('Erase all tasks, hours and events from this browser? This cannot be undone.')) {
      dispatch({ type: 'data/replace', data: createEmptyData() });
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
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={onImport}>
                <CalendarPlus className="size-4" /> Import .ics
              </Button>
              <Button size="sm" onClick={() => onEditEvent()}>
                <Plus className="size-4" /> Add event
              </Button>
            </div>
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

      <Card>
        <CardHeader
          title="Your data"
          description="Everything is saved in this browser. Export a backup to move it to another device."
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
          <Button variant="danger" onClick={eraseAll} className="sm:ml-auto">
            Erase everything
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
    </div>
  );
}
