import { CalendarPlus, Check, ListTodo, Plus, Repeat, RotateCcw } from 'lucide-react';
import { relativeDayLabel, relativeDayPhrase, type ISODate } from '../lib/dates';
import { PRIORITY_ORDER, priorityOf, type Priority } from '../lib/priority';
import { compareTasks } from '../lib/scheduler';
import { formatDuration } from '../lib/time';
import { cx } from '../components/cx';
import { Button, Card, EmptyState, PriorityBadge, ProgressBar } from '../components/ui';
import { useStore } from '../state/context';
import { isTaskComplete, type Plan } from '../state/planner';
import { nextSeriesDate, seriesRepeatLabel } from '../state/recurring';
import type { Task, TaskSeries } from '../state/types';

const GROUP_DESCRIPTIONS: Record<Priority, string> = {
  overdue: 'Past their due date',
  urgent: 'Due today',
  needed: 'Due within a week',
  todo: 'Due later',
};

function finishLabel(finishDate: ISODate, today: ISODate): string {
  const label = relativeDayLabel(finishDate, today);
  if (label === 'Today') return 'Done today';
  if (label === 'Tomorrow') return 'Done tomorrow';
  return `Done by ${label}`;
}

export function TasksView({
  plan,
  onAddTask,
  onAddMany,
  onImport,
  onEditTask,
  onEditSeries,
}: {
  plan: Plan;
  onAddTask: () => void;
  onAddMany: () => void;
  onImport: () => void;
  onEditTask: (task: Task) => void;
  onEditSeries: (series: TaskSeries) => void;
}) {
  const { data, dispatch } = useStore();
  const { today } = plan;
  const logged = (task: Task) => plan.logged.get(task.id) ?? 0;

  // A repeating task shows only its next open day here, so a week of copies doesn't crowd the list.
  const nextCopy = new Map<string, Task>();
  for (const t of data.tasks) {
    if (!t.seriesId || isTaskComplete(t, logged(t))) continue;
    const current = nextCopy.get(t.seriesId);
    if (!current || t.dueDate < current.dueDate) nextCopy.set(t.seriesId, t);
  }
  const seriesById = new Map((data.series ?? []).map((s) => [s.id, s]));
  // Repeating tasks with no open copy right now, such as one that starts next month or a day you
  // just skipped, still show here so you can change or stop them.
  const waiting = (data.series ?? []).filter((s) => !nextCopy.has(s.id));

  const open = data.tasks
    .filter((t) => !isTaskComplete(t, logged(t)) && (!t.seriesId || nextCopy.get(t.seriesId) === t))
    .sort((a, b) =>
      compareTasks(
        { id: a.id, dueDate: a.dueDate, remainingMinutes: 0, createdAt: a.createdAt },
        { id: b.id, dueDate: b.dueDate, remainingMinutes: 0, createdAt: b.createdAt },
      ),
    );
  const completed = data.tasks
    .filter((t) => isTaskComplete(t, logged(t)) && !t.seriesId)
    .sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1));

  const groups = PRIORITY_ORDER.map((priority) => ({
    priority,
    tasks: open.filter((t) => priorityOf(t.dueDate, today) === priority),
  })).filter((g) => g.tasks.length > 0);

  const totalLeft = open.reduce((sum, t) => sum + t.estimateMinutes - logged(t), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">Tasks</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {open.length ? `${open.length} open · ${formatDuration(totalLeft)} of work left` : 'Nothing open'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={onImport}>
            <CalendarPlus className="size-4" /> Import
          </Button>
          <Button onClick={onAddMany}>Add several</Button>
        </div>
      </div>

      {waiting.length > 0 && (
        <Card className="p-2 sm:p-3">
          <div className="flex items-center gap-2 px-2 pt-1 pb-2 text-sm text-slate-500 dark:text-slate-400">
            <Repeat className="size-4" aria-hidden /> Repeating, nothing to do yet
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {waiting.map((s) => {
              const next = nextSeriesDate(s, today);
              return (
                <li key={s.id}>
                  <button type="button" onClick={() => onEditSeries(s)} className="w-full px-2 py-3 text-left">
                    <p className="truncate font-medium text-slate-900 dark:text-white">{s.title}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {seriesRepeatLabel(s.days)} · {next ? `Next ${relativeDayPhrase(next, today)}` : 'Ended'} ·{' '}
                      {formatDuration(s.estimateMinutes)}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {open.length === 0 && waiting.length === 0 && (
        <Card>
          <EmptyState
            icon={<ListTodo className="size-6" />}
            title="No open tasks"
            action={
              <Button variant="primary" onClick={onAddTask}>
                <Plus className="size-4" /> Add a task
              </Button>
            }
          >
            Add a task with a due date and an estimate, and it shows up on your daily list.
          </EmptyState>
        </Card>
      )}

      {groups.map(({ priority, tasks }) => (
        <Card key={priority} className="p-2 sm:p-3">
          <div className="flex items-center gap-2 px-2 pt-1 pb-2">
            <PriorityBadge priority={priority} />
            <span className="text-sm text-slate-500 dark:text-slate-400">{GROUP_DESCRIPTIONS[priority]}</span>
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {tasks.map((task) => {
              const forecast = plan.forecasts.get(task.id);
              const done = logged(task);
              return (
                <li key={task.id} className="flex items-center gap-3 px-2 py-3">
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'task/setComplete', id: task.id, complete: true })}
                    className="flex size-6 shrink-0 items-center justify-center rounded-md border-2 border-slate-300 text-transparent hover:border-emerald-500 hover:text-emerald-500 dark:border-slate-600"
                    aria-label={`Mark "${task.title}" finished`}
                    title="Mark finished"
                  >
                    <Check className="size-3.5" strokeWidth={3} />
                  </button>
                  <button type="button" onClick={() => onEditTask(task)} className="min-w-0 flex-1 text-left">
                    <p className="truncate font-medium text-slate-900 dark:text-white">{task.title}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
                      {task.seriesId && seriesById.has(task.seriesId) && (
                        <span className="flex items-center gap-1">
                          <Repeat className="size-3.5" aria-hidden /> {seriesRepeatLabel(seriesById.get(task.seriesId)!.days)} ·
                        </span>
                      )}
                      <span>
                        {task.seriesId ? 'Next' : 'Due'} {relativeDayPhrase(task.dueDate, today)} ·{' '}
                        {!task.seriesId && task.planDate && task.planDate >= today && (
                          <>Working on it {relativeDayPhrase(task.planDate, today)} · </>
                        )}
                        {done > 0
                          ? `${formatDuration(done)} of ${formatDuration(task.estimateMinutes)}`
                          : formatDuration(task.estimateMinutes)}
                      </span>
                      {forecast && (
                        <span
                          className={cx(
                            'rounded-full px-2 py-0.5 text-xs font-medium',
                            forecast.atRisk
                              ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
                              : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
                          )}
                          title={forecast.atRisk ? "Won't be finished by its due date with your current hours" : undefined}
                        >
                          {forecast.atRisk || !forecast.finishDate ? 'At risk' : finishLabel(forecast.finishDate, today)}
                        </span>
                      )}
                    </div>
                    {done > 0 && <ProgressBar value={done} max={task.estimateMinutes} className="mt-1.5 h-1 max-w-48" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      ))}

      {completed.length > 0 && (
        <details className="group rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:p-3 dark:border-slate-800 dark:bg-slate-900">
          <summary className="cursor-pointer list-none px-2 py-1 text-sm font-medium text-slate-600 dark:text-slate-300">
            Finished ({completed.length})
          </summary>
          <ul className="mt-1 divide-y divide-slate-100 dark:divide-slate-800">
            {completed.map((task) => (
              <li key={task.id} className="flex items-center gap-3 px-2 py-2.5">
                <Check className="size-4 shrink-0 text-emerald-500" />
                <button
                  type="button"
                  onClick={() => onEditTask(task)}
                  className="min-w-0 flex-1 truncate text-left text-slate-500 line-through dark:text-slate-400"
                >
                  {task.title}
                </button>
                {task.completedAt && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => dispatch({ type: 'task/setComplete', id: task.id, complete: false })}
                  >
                    <RotateCcw className="size-3.5" /> Reopen
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
