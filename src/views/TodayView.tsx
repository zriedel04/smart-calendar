import { AlertTriangle, ArrowRight, Check, Clock, Coffee, MapPin, MoreHorizontal, PartyPopper, Pin, Play, Plus, Repeat, SkipForward, Sparkles, Square, Timer } from 'lucide-react';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { capacityOn, eventsOn, freeHoursOn, hasOverride, workingHoursOn } from '../lib/availability';
import { nextQuarterHour, timeBlocks } from '../lib/timeBlocks';
import { addDays, formatDate, localToday, relativeDayPhrase } from '../lib/dates';
import { priorityOf } from '../lib/priority';
import { formatDuration, formatRange, type TimeRange } from '../lib/time';
import { cx } from '../components/cx';
import { inputClass } from '../components/styles';
import { eventTime, mapsUrl } from '../components/eventStyles';
import { Button, Card, EmptyState, PriorityBadge, ProgressBar, EventIcon } from '../components/ui';
import { useStore } from '../state/context';
import { useClockMinutes, useShowTimes } from '../state/preferences';
import { isTaskComplete, remainingMinutes, type Plan } from '../state/planner';
import type { Task } from '../state/types';

export function TodayView({
  plan,
  onAddTask,
  onEditTask,
  onEditDay,
  onLoadSample,
  onOpenSchedule,
}: {
  plan: Plan;
  onAddTask: () => void;
  onEditTask: (task: Task) => void;
  onEditDay: (date: string) => void;
  onLoadSample: () => void;
  onOpenSchedule: () => void;
}) {
  const { data, dispatch } = useStore();
  const { today } = plan;
  const tasksById = useMemo(() => new Map(data.tasks.map((t) => [t.id, t])), [data.tasks]);

  const working = workingHoursOn(data, today);
  const events = eventsOn(data.events, today);
  const capacity = capacityOn(data, today);
  const pending = plan.dayPlan(today).items;
  const plannedLeft = pending.reduce((sum, i) => sum + i.minutes, 0);
  const goal = plan.doneToday + plannedLeft;

  // Work ticked off today, one row per task.
  const done = useMemo(() => {
    const byTask = new Map<string, number>();
    for (const log of data.logs) {
      if (log.date === today) byTask.set(log.taskId, (byTask.get(log.taskId) ?? 0) + log.minutes);
    }
    return [...byTask].map(([taskId, minutes]) => ({ taskId, minutes }));
  }, [data.logs, today]);

  const openTasks = data.tasks.filter((t) => !isTaskComplete(t, plan.logged.get(t.id) ?? 0));
  const atRisk = openTasks.filter((t) => plan.forecasts.get(t.id)?.atRisk);
  const freeLeft = Math.max(0, capacity - goal);
  // Tasks pushed off today that would otherwise still need work.
  const pushed = openTasks.filter((t) => !t.seriesId && t.notBefore && t.notBefore > today);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [showTimes, setShowTimes] = useShowTimes();
  const clock = useClockMinutes();
  // Suggested times for what's left today, starting from now.
  const times = new Map(
    timeBlocks(freeHoursOn(data, today), pending, nextQuarterHour(clock)).map((t) => [t.taskId, t.ranges]),
  );

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-indigo-600 dark:text-indigo-300">
              {formatDate(today, { weekday: 'long' })}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
              {formatDate(today, { month: 'long', day: 'numeric' })}
            </h1>
          </div>
          <Button size="sm" onClick={() => onEditDay(today)}>
            <Clock className="size-4" /> Change today's hours
          </Button>
        </div>

        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
          {working.length ? (
            <>
              <span>{working.map(formatRange).join(', ')}</span>
              <span className="text-slate-300 dark:text-slate-600">•</span>
              <span>{formatDuration(capacity)} to work</span>
              {events.length > 0 && <span className="text-slate-400">(after events)</span>}
            </>
          ) : (
            <span>No work hours today</span>
          )}
          {hasOverride(data, today) && (
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200">
              Changed for today
            </span>
          )}
        </p>

        {goal > 0 && (
          <div className="mt-4 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {formatDuration(plan.doneToday)} of {formatDuration(goal)} done
              </span>
              <span className="text-slate-500 dark:text-slate-400">{formatDuration(plannedLeft)} to go</span>
            </div>
            <ProgressBar value={plan.doneToday} max={goal} />
          </div>
        )}
      </Card>

      {atRisk.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4" /> {atRisk.length === 1 ? 'One task is' : `${atRisk.length} tasks are`}{' '}
            at risk
          </p>
          <ul className="mt-2 space-y-1">
            {atRisk.slice(0, 4).map((task) => {
              const forecast = plan.forecasts.get(task.id);
              return (
                <li key={task.id}>
                  <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => onEditTask(task)}>
                    <span className="font-medium">{task.title}</span>{' '}
                    {forecast?.finishDate
                      ? `won't be done until ${relativeDayPhrase(forecast.finishDate, today)}, but it's due ${relativeDayPhrase(task.dueDate, today)}.`
                      : "can't be scheduled because there are no work hours set."}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-amber-800/80 dark:text-amber-100/70">
            Add work hours, push the due date, or lower the estimate.
          </p>
        </div>
      )}

      {events.length > 0 && (
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">On your calendar</h2>
          <ul className="space-y-1.5">
            {events.map((e) => (
              <li key={e.id} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <EventIcon event={e} className="size-4 text-slate-400" />
                <span className="tabular-nums">{eventTime(e)}</span>
                <span className="min-w-0 font-medium text-slate-800 dark:text-slate-100">{e.title}</span>
                {e.location && (
                  <a
                    href={mapsUrl(e.location)}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto flex min-w-0 shrink items-center gap-1 text-xs text-indigo-600 hover:underline dark:text-indigo-300"
                  >
                    <MapPin className="size-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{e.location}</span>
                  </a>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-2 sm:p-3">
        <div className="flex items-center justify-between px-2 pt-1 pb-2">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Today's list</h2>
          {pending.length > 0 && (
            <button
              type="button"
              role="switch"
              aria-checked={showTimes}
              onClick={() => setShowTimes(!showTimes)}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
              <Clock className="size-3.5" /> Suggested times {showTimes ? 'on' : 'off'}
            </button>
          )}
        </div>

        {data.tasks.length === 0 ? (
          <EmptyState icon={<Sparkles className="size-6" />} title="Let's set up your calendar">
            <p className="font-medium text-slate-700 dark:text-slate-200">1. When do you usually work?</p>
            <HourPresets onOpenSchedule={onOpenSchedule} />
            <p className="mt-5 font-medium text-slate-700 dark:text-slate-200">2. Add what you need to get done</p>
            <p>Give each task a due date and how long it'll take. Your work hours fill up with it automatically.</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <Button variant="primary" onClick={onAddTask}>
                <Plus className="size-4" /> Add your first task
              </Button>
              <Button onClick={onLoadSample}>Try it with sample tasks</Button>
            </div>
          </EmptyState>
        ) : pending.length === 0 && done.length === 0 && pushed.length === 0 ? (
          capacity === 0 ? (
            <EmptyState icon={<Coffee className="size-6" />} title="No work hours today">
              Enjoy the day off. Your list picks back up on your next work day.
            </EmptyState>
          ) : (
            <EmptyState icon={<PartyPopper className="size-6" />} title="Nothing left to schedule">
              You're ahead of everything on your list. Add a task to keep going.
            </EmptyState>
          )
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {pending.map((item) => {
              const task = tasksById.get(item.taskId);
              if (!task) return null;
              const left = remainingMinutes(task, plan.logged.get(task.id) ?? 0);
              return (
                <ChecklistRow
                  key={`todo-${task.id}`}
                  checked={false}
                  task={task}
                  badge={<PriorityBadge priority={priorityOf(task.dueDate, today)} />}
                  meta={
                    <>
                      {data.timer?.taskId === task.id && (
                        <Timer className="mr-1 inline size-3.5 align-[-2px] text-indigo-600 dark:text-indigo-300" aria-label="Timer running" />
                      )}
                      {showTimes && <SuggestedTime ranges={times.get(task.id)} />}
                      {task.seriesId && <Repeat className="mr-1 inline size-3.5 align-[-2px]" aria-label="Repeats" />}
                      {task.planDate === today && (
                        <Pin className="mr-1 inline size-3.5 align-[-2px] text-indigo-500" aria-label="You chose today" />
                      )}
                      {formatDuration(item.minutes)}
                      {task.seriesId ? '' : ` · due ${relativeDayPhrase(task.dueDate, today)}`}

                      {item.minutes < left && ` · ${formatDuration(left)} left in total`}
                    </>
                  }
                  onToggle={() => dispatch({ type: 'work/log', taskId: task.id, date: today, minutes: item.minutes })}
                  onOpen={() => onEditTask(task)}
                  actionsOpen={openRow === task.id}
                  onToggleActions={() => setOpenRow(openRow === task.id ? null : task.id)}
                  actions={
                    <RowActions
                      task={task}
                      plannedMinutes={item.minutes}
                      timing={data.timer?.taskId === task.id}
                      onTimer={() => {
                        const at = new Date().toISOString();
                        dispatch(
                          data.timer?.taskId === task.id
                            ? { type: 'timer/stop', at, date: localToday() }
                            : { type: 'timer/start', taskId: task.id, at, date: localToday() },
                        );
                        setOpenRow(null);
                      }}
                      onLog={(minutes) => {
                        dispatch({ type: 'work/log', taskId: task.id, date: today, minutes });
                        setOpenRow(null);
                      }}
                      onPush={() => {
                        // A repeating task's copy belongs to its day, so pushing it skips the day.
                        dispatch(
                          task.seriesId
                            ? { type: 'task/skip', id: task.id }
                            : { type: 'task/push', id: task.id, until: addDays(today, 1) },
                        );
                        setOpenRow(null);
                      }}
                    />
                  }
                />
              );
            })}
            {done.map(({ taskId, minutes }) => {
              const task = tasksById.get(taskId);
              if (!task) return null;
              return (
                <ChecklistRow
                  key={`done-${taskId}`}
                  checked
                  task={task}
                  meta={`${formatDuration(minutes)} done`}
                  onToggle={() => dispatch({ type: 'work/undoDay', taskId, date: today })}
                  onOpen={() => onEditTask(task)}
                />
              );
            })}
          </ul>
        )}

        {pushed.length > 0 && (
          <div className="mx-2 mt-2 mb-1 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
            <p className="font-medium text-slate-700 dark:text-slate-200">Pushed to tomorrow</p>
            <ul className="mt-1 space-y-1">
              {pushed.map((task) => (
                <li key={task.id} className="flex items-center justify-between gap-3 text-slate-600 dark:text-slate-300">
                  <span className="truncate">{task.title}</span>
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'task/unpush', id: task.id })}
                    aria-label={`Bring "${task.title}" back to today`}
                    className="shrink-0 font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-300"
                  >
                    Bring back
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {pending.length === 0 && done.length > 0 && pushed.length === 0 && (
          <p className="px-2 pt-3 pb-2 text-center text-sm font-medium text-emerald-700 dark:text-emerald-300">
            All done for today. Nice work!
          </p>
        )}
        {pending.length > 0 && freeLeft >= 15 && (
          <p className="px-2 pt-3 pb-2 text-sm text-slate-500 dark:text-slate-400">
            {formatDuration(freeLeft)} of today is still free. That's everything on your list, so you're ahead.
          </p>
        )}
      </Card>
    </div>
  );
}

function ChecklistRow({
  checked,
  task,
  badge,
  meta,
  onToggle,
  onOpen,
  actions,
  actionsOpen = false,
  onToggleActions,
}: {
  checked: boolean;
  task: Task;
  badge?: ReactNode;
  meta: ReactNode;
  onToggle: () => void;
  onOpen: () => void;
  /** Extra options shown under the row, such as logging part of it. */
  actions?: ReactNode;
  actionsOpen?: boolean;
  onToggleActions?: () => void;
}) {
  return (
    <li className="px-2 py-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          aria-label={checked ? `Mark "${task.title}" not done` : `Mark "${task.title}" done`}
          onClick={onToggle}
          className={cx(
            'flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
            checked
              ? 'border-emerald-500 bg-emerald-500 text-white'
              : 'border-slate-300 text-transparent hover:border-indigo-500 hover:text-indigo-300 dark:border-slate-600',
          )}
        >
          <Check className="size-3.5" strokeWidth={3} />
        </button>
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <p
            className={cx(
              'truncate font-medium',
              checked ? 'text-slate-400 line-through dark:text-slate-500' : 'text-slate-900 dark:text-white',
            )}
          >
            {task.title}
          </p>
          <p className="truncate text-sm text-slate-500 dark:text-slate-400">{meta}</p>
        </button>
        {badge}
        {actions && (
          <button
            type="button"
            aria-label={`More for "${task.title}"`}
            aria-expanded={actionsOpen}
            onClick={onToggleActions}
            className={cx(
              'flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200',
              actionsOpen && 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200',
            )}
          >
            <MoreHorizontal className="size-4" />
          </button>
        )}
      </div>
      {actions && actionsOpen && <div className="mt-3 ml-9">{actions}</div>}
    </li>
  );
}

/** Log part of an item, or push it off today's list. */
function RowActions({
  task,
  plannedMinutes,
  timing,
  onTimer,
  onLog,
  onPush,
}: {
  task: Task;
  plannedMinutes: number;
  timing: boolean;
  onTimer: () => void;
  onLog: (minutes: number) => void;
  onPush: () => void;
}) {
  const [hours, setHours] = useState('');
  const minutes = Math.round(Number(hours) * 60);
  const valid = hours.trim() !== '' && Number.isFinite(minutes) && minutes >= 5;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (valid) onLog(minutes);
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <Button size="sm" variant={timing ? 'primary' : 'secondary'} onClick={onTimer}>
        {timing ? (
          <>
            <Square className="size-3 fill-current" /> Stop and log
          </>
        ) : (
          <>
            <Play className="size-3.5 fill-current" /> Start timer
          </>
        )}
      </Button>
      <form onSubmit={submit} className="flex items-center gap-2" noValidate>
        <label htmlFor={`part-${task.id}`} className="text-slate-600 dark:text-slate-300">
          Did part of it:
        </label>
        <div className="w-20">
          <input
            id={`part-${task.id}`}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.25"
            placeholder="Hours"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            aria-label={`Hours done on "${task.title}"`}
            aria-describedby={`part-hint-${task.id}`}
            className={cx(inputClass, 'py-1.5')}
          />
        </div>
        <Button size="sm" type="submit" disabled={!valid}>
          Log
        </Button>
        <span id={`part-hint-${task.id}`} className="sr-only">
          {formatDuration(plannedMinutes)} planned today
        </span>
      </form>
      <Button size="sm" variant="ghost" onClick={onPush}>
        {task.seriesId ? (
          <>
            <SkipForward className="size-4" /> Skip today
          </>
        ) : (
          <>
            <ArrowRight className="size-4" /> Push to tomorrow
          </>
        )}
      </Button>
    </div>
  );
}

const block = (start: number, end: number) => [{ start: start * 60, end: end * 60 }];
const HOUR_PRESETS: { label: string; week: TimeRange[][] }[] = [
  { label: 'Weekdays, 12pm to 6pm', week: [[], ...Array.from({ length: 5 }, () => block(12, 18)), []] },
  { label: 'Weekdays, 9am to 5pm', week: [[], ...Array.from({ length: 5 }, () => block(9, 17)), []] },
  { label: 'Every evening, 6pm to 10pm', week: Array.from({ length: 7 }, () => block(18, 22)) },
  { label: 'Every day, 10am to 4pm', week: Array.from({ length: 7 }, () => block(10, 16)) },
];

/** Quick choices for your usual weekly hours, for someone just starting out. */
function HourPresets({ onOpenSchedule }: { onOpenSchedule: () => void }) {
  const { data, dispatch } = useStore();
  const current = JSON.stringify(data.weeklyHours);
  return (
    <div className="mt-2">
      <div role="radiogroup" aria-label="Usual work hours" className="flex flex-wrap justify-center gap-2">
        {HOUR_PRESETS.map(({ label, week }) => {
          const selected = JSON.stringify(week) === current;
          return (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => dispatch({ type: 'hours/setWeek', weeklyHours: week })}
              className={cx(
                'rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset',
                selected
                  ? 'bg-indigo-600 text-white ring-indigo-600'
                  : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800',
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onOpenSchedule}
        className="mt-2 text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-300"
      >
        Something else? Set your hours day by day
      </button>
    </div>
  );
}

/** When to work on an item, shown first on its line: one span from its start to its end, even across a break. */
function SuggestedTime({ ranges }: { ranges?: TimeRange[] }) {
  const first = ranges?.[0];
  const last = ranges?.at(-1);
  if (!first || !last) return null;
  return (
    <span
      className="font-medium text-indigo-600 dark:text-indigo-300"
      title={ranges.length > 1 ? `Split around a break: ${ranges.map(formatRange).join(', ')}` : undefined}
    >
      {formatRange({ start: first.start, end: last.end })} ·{' '}
    </span>
  );
}
