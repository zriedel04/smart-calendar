import { Check, ChevronLeft, ChevronRight, Pencil, Pin, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { capacityOn, eventsOn, freeHoursOn, hasOverride, workingHoursOn } from '../lib/availability';
import { nextQuarterHour, timeBlocks } from '../lib/timeBlocks';
import { addDays, formatDate, startOfWeek, type ISODate } from '../lib/dates';
import { holidaysOn } from '../lib/holidays';
import { priorityOf } from '../lib/priority';
import { formatClock, formatDuration, formatRange } from '../lib/time';
import { cx } from '../components/cx';
import { PRIORITY_DOT } from '../components/styles';
import { eventTime, HOLIDAY_CHIP } from '../components/eventStyles';
import { Button, ProgressBar, EventIcon } from '../components/ui';
import { useStore } from '../state/context';
import { useClockMinutes, useShowHolidays, useShowTimes } from '../state/preferences';
import type { Plan } from '../state/planner';
import type { Task } from '../state/types';

export function WeekView({
  plan,
  onEditDay,
  onEditTask,
}: {
  plan: Plan;
  onEditDay: (date: ISODate) => void;
  onEditTask: (task: Task) => void;
}) {
  const { data, dispatch } = useStore();
  const { today } = plan;
  const thisWeek = startOfWeek(today);
  const [weekStart, setWeekStart] = useState(thisWeek);
  const tasksById = useMemo(() => new Map(data.tasks.map((t) => [t.id, t])), [data.tasks]);
  const [showTimes] = useShowTimes();
  const [showHolidays] = useShowHolidays();
  const clock = useClockMinutes();
  const dates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  // Dragging a task onto a day plans it on that day.
  const [dragging, setDragging] = useState<Task | null>(null);
  const [dropTarget, setDropTarget] = useState<ISODate | null>(null);
  const canDrop = (date: ISODate) => dragging !== null && date >= today && date <= dragging.dueDate;
  const endDrag = () => {
    setDragging(null);
    setDropTarget(null);
  };

  const heading =
    weekStart === thisWeek
      ? 'This week'
      : weekStart === addDays(thisWeek, 7)
        ? 'Next week'
        : `Week of ${formatDate(weekStart, { month: 'short', day: 'numeric' })}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">{heading}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {formatDate(dates[0]!, { month: 'short', day: 'numeric' })} –{' '}
            {formatDate(dates[6]!, { month: 'short', day: 'numeric' })}
            <span className="hidden sm:inline"> · Drag a task to the day you want to work on it</span>
          </p>
        </div>
        <div className="flex items-center gap-1">
          {weekStart !== thisWeek && (
            <Button size="sm" variant="ghost" onClick={() => setWeekStart(thisWeek)}>
              Today
            </Button>
          )}
          <Button size="sm" aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button size="sm" aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <ol className="space-y-3">
        {dates.map((date) => {
          const isToday = date === today;
          const isPast = date < today;
          const working = workingHoursOn(data, date);
          const capacity = capacityOn(data, date);
          const events = eventsOn(data.events, date);
          const holidays = showHolidays ? holidaysOn(date) : [];
          const items = isPast ? [] : plan.dayPlan(date).items;

          const doneByTask = new Map<string, number>();
          if (isPast || isToday) {
            for (const log of data.logs) {
              if (log.date === date) doneByTask.set(log.taskId, (doneByTask.get(log.taskId) ?? 0) + log.minutes);
            }
          }
          const doneMinutes = [...doneByTask.values()].reduce((a, b) => a + b, 0);
          const plannedMinutes = items.reduce((a, i) => a + i.minutes, 0);
          const starts = new Map(
            showTimes
              ? timeBlocks(freeHoursOn(data, date), items, isToday ? nextQuarterHour(clock) : 0).map((t) => [
                  t.taskId,
                  t.ranges[0]?.start,
                ])
              : [],
          );

          return (
            <li
              key={date}
              onDragOver={(e) => {
                if (!canDrop(date)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dropTarget !== date) setDropTarget(date);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null) && dropTarget === date) setDropTarget(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging && canDrop(date)) dispatch({ type: 'task/plan', id: dragging.id, date });
                endDrag();
              }}
              className={cx(
                'rounded-2xl border p-4 shadow-sm',
                dropTarget === date ? 'bg-indigo-50 dark:bg-indigo-950' : 'bg-white dark:bg-slate-900',
                dropTarget === date
                  ? 'border-indigo-400 ring-2 ring-indigo-400'
                  : isToday
                    ? 'border-indigo-300 ring-1 ring-indigo-300 dark:border-indigo-500/60 dark:ring-indigo-500/60'
                    : 'border-slate-200 dark:border-slate-800',
                isPast && 'opacity-70',
              )}
            >
              <div className="flex items-start gap-4">
                <div className="w-12 shrink-0 text-center">
                  <p
                    className={cx(
                      'text-xs font-semibold uppercase',
                      isToday ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-500 dark:text-slate-400',
                    )}
                  >
                    {formatDate(date, { weekday: 'short' })}
                  </p>
                  <p
                    className={cx(
                      'mx-auto mt-0.5 flex size-9 items-center justify-center rounded-full text-lg font-semibold',
                      isToday ? 'bg-indigo-600 text-white' : 'text-slate-900 dark:text-white',
                    )}
                  >
                    {formatDate(date, { day: 'numeric' })}
                  </p>
                </div>

                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      {working.length ? (
                        <>
                          {working.map(formatRange).join(', ')}
                          <span className="text-slate-400"> · {formatDuration(capacity)}</span>
                        </>
                      ) : (
                        <span className="text-slate-400">Off</span>
                      )}
                      {hasOverride(data, date) && (
                        <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200">
                          Changed
                        </span>
                      )}
                    </p>
                    {!isPast && (
                      <button
                        type="button"
                        onClick={() => onEditDay(date)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                        aria-label={`Change hours for ${formatDate(date, { weekday: 'long', month: 'long', day: 'numeric' })}`}
                      >
                        <Pencil className="size-4" />
                      </button>
                    )}
                  </div>

                  {holidays.length > 0 && (
                    <ul className="flex flex-wrap gap-1">
                      {holidays.map((h) => (
                        <li
                          key={h.name}
                          className={cx('flex min-w-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium', HOLIDAY_CHIP)}
                        >
                          <Star className="size-3 shrink-0" aria-hidden />
                          <span className="truncate">{h.name}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {events.length > 0 && (
                    <ul className="space-y-1">
                      {events.map((e) => (
                        <li key={e.id} className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                          <EventIcon event={e} className="size-3.5" />
                          <span className="tabular-nums">{eventTime(e)}</span>
                          <span className="truncate">{e.title}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {(items.length > 0 || doneByTask.size > 0) && (
                    <ul className="space-y-1">
                      {[...doneByTask].map(([taskId, minutes]) => {
                        const task = tasksById.get(taskId);
                        if (!task) return null;
                        return (
                          <li key={`done-${taskId}`}>
                            <button
                              type="button"
                              onClick={() => onEditTask(task)}
                              className="flex w-full items-center gap-2 text-left text-sm text-slate-400 dark:text-slate-500"
                            >
                              <Check className="size-3.5 shrink-0 text-emerald-500" />
                              <span className="min-w-0 flex-1 truncate line-through">{task.title}</span>
                              <span className="tabular-nums">{formatDuration(minutes)}</span>
                            </button>
                          </li>
                        );
                      })}
                      {items.map((item) => {
                        const task = tasksById.get(item.taskId);
                        if (!task) return null;
                        return (
                          <li
                            key={`plan-${item.taskId}`}
                            draggable={!task.seriesId}
                            onDragStart={(e) => {
                              e.dataTransfer.effectAllowed = 'move';
                              e.dataTransfer.setData('text/plain', task.title);
                              setDragging(task);
                            }}
                            onDragEnd={endDrag}
                            className={cx(!task.seriesId && 'cursor-grab active:cursor-grabbing', dragging?.id === task.id && 'opacity-40')}
                          >
                            <button
                              type="button"
                              onClick={() => onEditTask(task)}
                              className="flex w-full items-center gap-2 text-left text-sm text-slate-700 hover:text-slate-950 dark:text-slate-200 dark:hover:text-white"
                            >
                              <span
                                className={cx('size-2 shrink-0 rounded-full', PRIORITY_DOT[priorityOf(task.dueDate, today)])}
                              />
                              {starts.get(item.taskId) !== undefined && (
                                <span className="w-14 shrink-0 text-xs text-slate-500 tabular-nums dark:text-slate-400">
                                  {formatClock(starts.get(item.taskId)!)}
                                </span>
                              )}
                              <span className="min-w-0 flex-1 truncate">{task.title}</span>
                              {task.planDate === date && (
                                <Pin className="size-3.5 shrink-0 text-indigo-500" aria-label="You chose this day" />
                              )}
                              <span className="tabular-nums text-slate-500 dark:text-slate-400">
                                {formatDuration(item.minutes)}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {capacity > 0 && !isPast && (
                    <div className="flex items-center gap-2 pt-1">
                      <ProgressBar value={doneMinutes + plannedMinutes} max={capacity} className="h-1.5 flex-1" />
                      <span className="text-xs text-slate-500 tabular-nums dark:text-slate-400">
                        {formatDuration(doneMinutes + plannedMinutes)} planned
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
