import { Check, ChevronLeft, ChevronRight, Flag, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { eventKind, eventsOn, type CalendarEvent } from '../lib/availability';
import { addDays, formatDate, startOfWeek, type ISODate } from '../lib/dates';
import { priorityOf, type Priority } from '../lib/priority';
import { formatDuration, formatRange } from '../lib/time';
import { cx } from '../components/cx';
import { EVENT_CHIP, EVENT_DOT, eventTime } from '../components/eventStyles';
import { PRIORITY_DOT } from '../components/styles';
import { Button, Card, EventIcon } from '../components/ui';
import { useStore } from '../state/context';
import { isTaskComplete, type Plan } from '../state/planner';
import { useDueDatesOnly } from '../state/preferences';
import type { Task } from '../state/types';

const WEEKDAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** One line on a calendar day: either work planned/done that day, or a task due that day. */
interface Entry {
  key: string;
  task: Task;
  kind: 'work' | 'due';
  minutes?: number;
  done: boolean;
  priority: Priority;
}

function firstOfMonth(date: ISODate): ISODate {
  return `${date.slice(0, 7)}-01`;
}

function addMonths(monthStart: ISODate, months: number): ISODate {
  const [y, m] = monthStart.split('-').map(Number) as [number, number];
  const index = y * 12 + (m - 1) + months;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-01`;
}

/** A month calendar: each day shows the work planned or done that day and what's due, crossed off when finished. */
export function MonthView({
  plan,
  onEditTask,
  onEditDay,
  onEditEvent,
  onAddEvent,
  onSelectDay,
}: {
  plan: Plan;
  onEditTask: (task: Task) => void;
  onEditDay: (date: ISODate) => void;
  onEditEvent: (event: CalendarEvent) => void;
  onAddEvent: (date: ISODate) => void;
  /** Tells the app which day is picked, so its Event and Task buttons use that day. */
  onSelectDay?: (date: ISODate) => void;
}) {
  const { data, dispatch } = useStore();
  const { today } = plan;
  const [month, setMonth] = useState(() => firstOfMonth(today));
  const [selected, setSelectedDay] = useState<ISODate>(today);
  // Deleting days: pick days on the calendar, then delete everything due on them.
  const [pickingDays, setPickingDays] = useState(false);
  const [pickedDays, setPickedDays] = useState<ReadonlySet<ISODate>>(new Set());
  // Deleting tasks: pick tasks in the selected day's list, then delete them.
  const [pickingTasks, setPickingTasks] = useState(false);
  const [pickedTasks, setPickedTasks] = useState<ReadonlySet<string>>(new Set());
  const setSelected = (date: ISODate) => {
    setSelectedDay(date);
    setPickedTasks(new Set());
    onSelectDay?.(date);
  };
  const toggleIn = <T,>(set: ReadonlySet<T>, item: T): Set<T> => {
    const next = new Set(set);
    if (next.has(item)) next.delete(item);
    else next.add(item);
    return next;
  };
  const dueOnPicked = data.tasks.filter((t) => pickedDays.has(t.dueDate));
  const stopPickingDays = () => {
    setPickingDays(false);
    setPickedDays(new Set());
  };
  const stopPickingTasks = () => {
    setPickingTasks(false);
    setPickedTasks(new Set());
  };
  const [dueOnly, setDueOnly] = useDueDatesOnly();

  const tasksById = useMemo(() => new Map(data.tasks.map((t) => [t.id, t])), [data.tasks]);
  const complete = (task: Task) => isTaskComplete(task, plan.logged.get(task.id) ?? 0);

  const entriesFor = (date: ISODate): Entry[] => {
    const entries: Entry[] = [];
    // Work already ticked off on this day, unless only due dates are shown.
    const doneByTask = new Map<string, number>();
    for (const log of data.logs) {
      if (log.date === date) doneByTask.set(log.taskId, (doneByTask.get(log.taskId) ?? 0) + log.minutes);
    }
    for (const [taskId, minutes] of dueOnly ? [] : doneByTask) {
      const task = tasksById.get(taskId);
      if (task)
        entries.push({ key: `done-${taskId}`, task, kind: 'work', minutes, done: true, priority: priorityOf(task.dueDate, today) });
    }
    // Work still planned for this day.
    if (!dueOnly && date >= today) {
      for (const item of plan.dayPlan(date).items) {
        const task = tasksById.get(item.taskId);
        if (task)
          entries.push({
            key: `plan-${item.taskId}`,
            task,
            kind: 'work',
            minutes: item.minutes,
            done: false,
            priority: priorityOf(task.dueDate, today),
          });
      }
    }
    // Due dates.
    for (const task of data.tasks) {
      if (task.dueDate === date)
        entries.push({ key: `due-${task.id}`, task, kind: 'due', done: complete(task), priority: priorityOf(task.dueDate, today) });
    }
    return entries;
  };

  const gridStart = startOfWeek(month);
  const nextMonth = addMonths(month, 1);
  const days: ISODate[] = [];
  for (let d = gridStart; d < nextMonth || days.length % 7 !== 0; d = addDays(d, 1)) days.push(d);
  const selectedEntries = entriesFor(selected);
  const selectedEvents = eventsOn(data.events, selected);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
          {formatDate(month, { month: 'long', year: 'numeric' })}
        </h1>
        <div className="flex items-center gap-1">
          <button
            type="button"
            role="switch"
            aria-checked={dueOnly}
            onClick={() => setDueOnly(!dueOnly)}
            title={dueOnly ? 'Showing only what is due each day' : 'Showing what is due and the work planned each day'}
            className="mr-1 flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <Flag className="size-3.5" /> Due dates only {dueOnly ? 'on' : 'off'}
          </button>
          <button
            type="button"
            aria-pressed={pickingDays}
            onClick={() => (pickingDays ? stopPickingDays() : setPickingDays(true))}
            className={cx(
              'mr-1 flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium',
              pickingDays
                ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200',
            )}
          >
            <Trash2 className="size-3.5" /> Deletion mode
          </button>
          {month !== firstOfMonth(today) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setMonth(firstOfMonth(today));
                setSelected(today);
              }}
            >
              Today
            </Button>
          )}
          <Button size="sm" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button size="sm" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {pickingDays && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
          <span>
            {pickedDays.size === 0
              ? 'Pick the days to clear. Everything due on them will be deleted.'
              : `${dueOnPicked.length} ${dueOnPicked.length === 1 ? 'task' : 'tasks'} due on ${pickedDays.size} ${pickedDays.size === 1 ? 'day' : 'days'}`}
          </span>
          <span className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={stopPickingDays}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={dueOnPicked.length === 0}
              onClick={() => {
                dispatch({ type: 'task/deleteMany', ids: dueOnPicked.map((t) => t.id) });
                stopPickingDays();
              }}
            >
              <Trash2 className="size-4" /> Delete {dueOnPicked.length || ''} {dueOnPicked.length === 1 ? 'task' : 'tasks'}
            </Button>
          </span>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
          {WEEKDAY_HEADERS.map((d) => (
            <div key={d} className="py-2 text-center text-xs font-semibold text-slate-500 uppercase dark:text-slate-400">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((date) => {
            const inMonth = date >= month && date < nextMonth;
            const isToday = date === today;
            const entries = entriesFor(date);
            const events = eventsOn(data.events, date);
            const shownEvents = events.slice(0, 3);
            const shown = entries.slice(0, 3 - shownEvents.length);
            const more = events.length + entries.length - shownEvents.length - shown.length;
            return (
              <button
                key={date}
                type="button"
                onClick={() => (pickingDays ? setPickedDays(toggleIn(pickedDays, date)) : setSelected(date))}
                aria-label={formatDate(date, { weekday: 'long', month: 'long', day: 'numeric' })}
                aria-pressed={pickingDays ? pickedDays.has(date) : selected === date}
                className={cx(
                  'flex min-h-16 flex-col gap-0.5 border-r border-b border-slate-100 p-1 text-left align-top transition-colors sm:min-h-28 sm:p-1.5 dark:border-slate-800',
                  !inMonth && 'bg-slate-50/60 dark:bg-slate-950/40',
                  pickingDays
                    ? pickedDays.has(date)
                      ? 'bg-rose-100 ring-2 ring-rose-400 ring-inset dark:bg-rose-500/20'
                      : 'hover:bg-rose-50 dark:hover:bg-rose-500/10'
                    : selected === date
                      ? 'bg-indigo-50/70 dark:bg-indigo-500/10'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50',
                )}
              >
                <span
                  className={cx(
                    'flex size-6 items-center justify-center rounded-full text-xs font-semibold',
                    isToday
                      ? 'bg-indigo-600 text-white'
                      : inMonth
                        ? 'text-slate-700 dark:text-slate-200'
                        : 'text-slate-400 dark:text-slate-600',
                  )}
                >
                  {Number(date.slice(8))}
                </span>
                {/* Phones: colored dots. Larger screens: titles. */}
                <span className="flex flex-wrap gap-0.5 sm:hidden">
                  {events.slice(0, 4).map((e) => (
                    <span key={e.id} className={cx('size-1.5 rounded-full', EVENT_DOT[eventKind(e)])} />
                  ))}
                  {entries.slice(0, Math.max(0, 4 - events.length)).map((e) => (
                    <span
                      key={e.key}
                      className={cx('size-1.5 rounded-full', e.done ? 'bg-slate-300 dark:bg-slate-600' : PRIORITY_DOT[e.priority])}
                    />
                  ))}
                </span>
                <span className="hidden w-full flex-col gap-0.5 sm:flex">
                  {shownEvents.map((e) => (
                    <span
                      key={e.id}
                      className={cx('flex flex-col rounded px-1 py-0.5 text-[11px] leading-tight', EVENT_CHIP[eventKind(e)])}
                    >
                      <span className="flex min-w-0 items-center gap-1">
                        <EventIcon event={e} className="size-2.5" />
                        <span className="truncate">{e.title}</span>
                      </span>
                      {!e.allDay && <span className="truncate pl-3.5 text-[10px] tabular-nums opacity-75">{formatRange(e)}</span>}
                    </span>
                  ))}
                  {shown.map((e) => (
                    <span
                      key={e.key}
                      className={cx(
                        'flex items-center gap-1 truncate rounded px-1 py-0.5 text-[11px] leading-tight',
                        e.done
                          ? 'text-slate-400 line-through dark:text-slate-500'
                          : e.kind === 'due'
                            ? 'bg-rose-50 font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
                            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
                      )}
                    >
                      {e.kind === 'due' ? (
                        <Flag className="size-2.5 shrink-0" />
                      ) : (
                        <span className={cx('size-1.5 shrink-0 rounded-full', e.done ? 'bg-slate-300' : PRIORITY_DOT[e.priority])} />
                      )}
                      <span className="truncate">{e.task.title}</span>
                    </span>
                  ))}
                  {more > 0 && <span className="px-1 text-[11px] text-slate-500 dark:text-slate-400">+{more} more</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <Card className="p-2 sm:p-3">
        <div className="flex items-center justify-between px-2 pt-1 pb-2">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            {formatDate(selected, { weekday: 'long', month: 'long', day: 'numeric' })}
          </h2>
          <div className="flex gap-1">
            {selectedEntries.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                aria-pressed={pickingTasks}
                onClick={() => (pickingTasks ? stopPickingTasks() : setPickingTasks(true))}
              >
                <Trash2 className="size-4" /> Delete mode
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => onAddEvent(selected)}>
              <Plus className="size-4" /> Event
            </Button>
            {selected >= today && (
              <Button size="sm" variant="ghost" onClick={() => onEditDay(selected)}>
                Change hours
              </Button>
            )}
          </div>
        </div>
        {selectedEvents.length > 0 && (
          <ul className="mb-1 space-y-1 px-1">
            {selectedEvents.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onEditEvent(e)}
                  className={cx('flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm', EVENT_CHIP[eventKind(e)])}
                >
                  <EventIcon event={e} className="size-4" />
                  <span className="min-w-0 flex-1 truncate font-medium">{e.title}</span>
                  <span className="shrink-0 text-xs tabular-nums opacity-80">{eventTime(e)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {selectedEntries.length === 0 && selectedEvents.length === 0 ? (
          <p className="px-2 pb-3 text-sm text-slate-500 dark:text-slate-400">Nothing on this day.</p>
        ) : selectedEntries.length === 0 ? null : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {selectedEntries.map((e) => {
              const canTick = e.kind === 'work' && selected === today;
              // A task finished by logging all its time can't be reopened from here (only by editing its estimate),
              // so its due-date entry gets a plain check mark instead of a checkbox.
              const canToggleDue = e.kind === 'due' && (!e.done || Boolean(e.task.completedAt));
              const toggle = () => {
                if (e.kind === 'due') {
                  dispatch({ type: 'task/setComplete', id: e.task.id, complete: !e.done });
                } else if (e.done) {
                  dispatch({ type: 'work/undoDay', taskId: e.task.id, date: today });
                } else {
                  dispatch({ type: 'work/log', taskId: e.task.id, date: today, minutes: e.minutes ?? 0 });
                }
              };
              return (
                <li key={e.key} className="flex items-center gap-3 px-2 py-2.5">
                  {pickingTasks ? (
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={pickedTasks.has(e.task.id)}
                      aria-label={`Select "${e.task.title}"`}
                      onClick={() => setPickedTasks(toggleIn(pickedTasks, e.task.id))}
                      className={cx(
                        'flex size-5 shrink-0 items-center justify-center rounded border-2',
                        pickedTasks.has(e.task.id)
                          ? 'border-rose-500 bg-rose-500 text-white'
                          : 'border-slate-300 text-transparent hover:border-rose-500 dark:border-slate-600',
                      )}
                    >
                      <Check className="size-3" strokeWidth={3} />
                    </button>
                  ) : canTick || canToggleDue ? (
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={e.done}
                      aria-label={
                        e.kind === 'due'
                          ? `Mark "${e.task.title}" ${e.done ? 'not finished' : 'finished'}`
                          : `${e.done ? 'Uncheck' : 'Check off'} "${e.task.title}"`
                      }
                      onClick={toggle}
                      className={cx(
                        'flex size-5 shrink-0 items-center justify-center rounded-full border-2',
                        e.done
                          ? 'border-emerald-500 bg-emerald-500 text-white'
                          : 'border-slate-300 text-transparent hover:border-indigo-500 dark:border-slate-600',
                      )}
                    >
                      <Check className="size-3" strokeWidth={3} />
                    </button>
                  ) : e.kind === 'due' ? (
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                  ) : (
                    <span className={cx('ml-1.5 size-2 shrink-0 rounded-full', e.done ? 'bg-emerald-500' : PRIORITY_DOT[e.priority])} />
                  )}
                  <button
                    type="button"
                    onClick={() => (pickingTasks ? setPickedTasks(toggleIn(pickedTasks, e.task.id)) : onEditTask(e.task))}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p
                      className={cx(
                        'truncate text-sm font-medium',
                        e.done ? 'text-slate-400 line-through dark:text-slate-500' : 'text-slate-900 dark:text-white',
                      )}
                    >
                      {e.task.title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {e.kind === 'due'
                        ? e.done
                          ? 'Finished'
                          : 'Due this day'
                        : `${formatDuration(e.minutes ?? 0)} ${e.done ? 'done' : 'planned'}`}
                    </p>
                  </button>
                  {e.kind === 'due' && <Flag className="size-4 shrink-0 text-rose-500" />}
                </li>
              );
            })}
          </ul>
        )}
        {pickingTasks && selectedEntries.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-2 pt-3 pb-1 dark:border-slate-800">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setPickedTasks(new Set(selectedEntries.map((e) => e.task.id)))}
            >
              Select all
            </Button>
            <span className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={stopPickingTasks}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={pickedTasks.size === 0}
                onClick={() => {
                  dispatch({ type: 'task/deleteMany', ids: [...pickedTasks] });
                  stopPickingTasks();
                }}
              >
                <Trash2 className="size-4" /> Delete {pickedTasks.size || ''} selected
              </Button>
            </span>
          </div>
        )}
      </Card>
    </div>
  );
}
