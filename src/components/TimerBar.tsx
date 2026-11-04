import { Square, Timer, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { localToday } from '../lib/dates';
import { formatStopwatch } from '../lib/time';
import { useStore } from '../state/context';

/** Shows the running timer under the header on every screen, with a button to stop and log it. */
export function TimerBar() {
  const { data, dispatch } = useStore();
  const timer = data.timer;
  const task = timer ? data.tasks.find((t) => t.id === timer.taskId) : undefined;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!timer) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [timer]);

  const reading = timer ? formatStopwatch((now - Date.parse(timer.startedAt)) / 1000) : '';

  useEffect(() => {
    if (!task) return;
    const previous = document.title;
    document.title = `${reading} · ${task.title}`;
    return () => {
      document.title = previous;
    };
  }, [reading, task]);

  if (!timer || !task) return null;

  return (
    <div className="border-t border-indigo-100 bg-indigo-50 dark:border-indigo-500/20 dark:bg-indigo-500/10">
      <div role="timer" aria-label={`Timer for "${task.title}"`} className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-2">
        <Timer className="size-4 shrink-0 text-indigo-600 dark:text-indigo-300" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-100">{task.title}</span>
        <span className="text-sm font-semibold text-indigo-700 tabular-nums dark:text-indigo-200">{reading}</span>
        <button
          type="button"
          onClick={() => dispatch({ type: 'timer/stop', at: new Date().toISOString(), date: localToday() })}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-2.5 py-1 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          <Square className="size-3 fill-current" aria-hidden /> Stop and log
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: 'timer/cancel' })}
          aria-label="Cancel timer without logging"
          className="shrink-0 rounded-lg p-1 text-slate-500 hover:bg-indigo-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-indigo-500/20 dark:hover:text-white"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
