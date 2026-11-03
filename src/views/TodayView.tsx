import { AlertTriangle, Check, Clock, Coffee, PartyPopper, Plus, Sparkles } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { capacityOn, eventsOn, hasOverride, workingHoursOn } from '../lib/availability';
import { formatDate, relativeDayPhrase } from '../lib/dates';
import { priorityOf } from '../lib/priority';
import { formatDuration, formatRange } from '../lib/time';
import { cx } from '../components/cx';
import { eventTime } from '../components/eventStyles';
import { Button, Card, EmptyState, PriorityBadge, ProgressBar, EventIcon } from '../components/ui';
import { useStore } from '../state/context';
import { isTaskComplete, remainingMinutes, type Plan } from '../state/planner';
import type { Task } from '../state/types';

export function TodayView({
  plan,
  onAddTask,
  onEditTask,
  onEditDay,
  onLoadSample,
}: {
  plan: Plan;
  onAddTask: () => void;
  onEditTask: (task: Task) => void;
  onEditDay: (date: string) => void;
  onLoadSample: () => void;
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
                <span className="font-medium text-slate-800 dark:text-slate-100">{e.title}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-2 sm:p-3">
        <div className="flex items-center justify-between px-2 pt-1 pb-2">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Today's list</h2>
          <Button size="sm" variant="ghost" onClick={onAddTask}>
            <Plus className="size-4" /> Add task
          </Button>
        </div>

        {data.tasks.length === 0 ? (
          <EmptyState icon={<Sparkles className="size-6" />} title="No tasks yet">
            <p>Add what you need to get done and how long it'll take. I'll fill your work hours with it.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button variant="primary" onClick={onAddTask}>
                <Plus className="size-4" /> Add your first task
              </Button>
              <Button onClick={onLoadSample}>Try it with sample tasks</Button>
            </div>
          </EmptyState>
        ) : pending.length === 0 && done.length === 0 ? (
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
                      {formatDuration(item.minutes)} · due {relativeDayPhrase(task.dueDate, today)}
                      {item.minutes < left && ` · ${formatDuration(left)} left in total`}
                    </>
                  }
                  onToggle={() => dispatch({ type: 'work/log', taskId: task.id, date: today, minutes: item.minutes })}
                  onOpen={() => onEditTask(task)}
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

        {pending.length === 0 && done.length > 0 && (
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
}: {
  checked: boolean;
  task: Task;
  badge?: ReactNode;
  meta: ReactNode;
  onToggle: () => void;
  onOpen: () => void;
}) {
  return (
    <li className="flex items-center gap-3 px-2 py-3">
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
    </li>
  );
}
