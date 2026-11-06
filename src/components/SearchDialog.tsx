import { CheckCircle2, MapPin, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { CalendarEvent } from '../lib/availability';
import { searchData } from '../lib/search';
import { formatDate, type ISODate } from '../lib/dates';
import { useStore } from '../state/context';
import type { Task, TaskSeries } from '../state/types';
import { EventIcon, Modal } from './ui';
import { eventRepeatLabel, eventTime } from './eventStyles';
import { inputClass } from './styles';

/** Finds tasks and events by name, place or notes. */
export function SearchDialog({
  today,
  onClose,
  onOpenTask,
  onOpenSeries,
  onOpenEvent,
}: {
  today: ISODate;
  onClose: () => void;
  onOpenTask: (task: Task) => void;
  onOpenSeries: (series: TaskSeries) => void;
  onOpenEvent: (event: CalendarEvent, occurrence?: ISODate) => void;
}) {
  const { data } = useStore();
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchData(data, query, today), [data, query, today]);

  const day = (date: ISODate) =>
    formatDate(date, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      ...(date.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}),
    });

  return (
    <Modal title="Search" onClose={onClose}>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <label htmlFor="search-input" className="sr-only">
          Search tasks and events
        </label>
        <input
          id="search-input"
          type="search"
          className={`${inputClass} pl-9`}
          placeholder="Search tasks and events"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          enterKeyHint="search"
        />
      </div>

      {results && results.events.length === 0 && results.tasks.length === 0 && results.series.length === 0 && (
        <p className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">Nothing matches "{query.trim()}".</p>
      )}

      {results && results.events.length > 0 && (
        <section className="mt-4">
          <h3 className="mb-1 px-1 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">Events</h3>
          <ul>
            {results.events.map(({ event, next }) => (
              <li key={event.id}>
                <button
                  type="button"
                  onClick={() => onOpenEvent(event, event.repeat !== 'none' && next ? next : undefined)}
                  className="flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <EventIcon event={event} className="mt-0.5 size-4 shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900 dark:text-white">{event.title}</span>
                    <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                      {event.repeat !== 'none'
                        ? `${eventRepeatLabel(event)}${next ? (next < today ? ' · on now' : ` · next ${day(next)}`) : ''}`
                        : day(event.date)}
                      {' · '}
                      {eventTime(event)}
                    </span>
                    {event.location && (
                      <span className="flex items-center gap-1 truncate text-xs text-slate-500 dark:text-slate-400">
                        <MapPin className="size-3 shrink-0" aria-hidden /> {event.location}
                      </span>
                    )}
                  </span>
                  {!next && <span className="shrink-0 text-xs text-slate-400">Past</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {results && (results.tasks.length > 0 || results.series.length > 0) && (
        <section className="mt-4">
          <h3 className="mb-1 px-1 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">Tasks</h3>
          <ul>
            {results.tasks.map(({ task, done }) => (
              <li key={task.id}>
                <button
                  type="button"
                  onClick={() => onOpenTask(task)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900 dark:text-white">{task.title}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      {task.seriesId ? 'Repeating' : `Due ${day(task.dueDate)}`}
                    </span>
                  </span>
                  {done && <CheckCircle2 className="size-4 shrink-0 text-emerald-500" aria-label="Done" />}
                </button>
              </li>
            ))}
            {results.series.map((series) => (
              <li key={series.id}>
                <button
                  type="button"
                  onClick={() => onOpenSeries(series)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900 dark:text-white">{series.title}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      {series.startDate > today ? `Repeating, starts ${day(series.startDate)}` : 'Repeating'}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Modal>
  );
}
