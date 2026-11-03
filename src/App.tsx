import { CalendarCheck, CalendarDays, CalendarRange, Clock, ListTodo, Plus, Sun } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { BulkTaskForm } from './components/BulkTaskForm';
import { DayHoursDialog } from './components/DayHoursDialog';
import { EventForm } from './components/EventForm';
import { ImportCalendarDialog } from './components/ImportCalendarDialog';
import { TaskForm } from './components/TaskForm';
import { cx } from './components/cx';
import type { CalendarEvent } from './lib/availability';
import type { ISODate } from './lib/dates';
import { useStore } from './state/context';
import { createSampleData, hasUserData } from './state/defaults';
import { planFor } from './state/planner';
import type { Task } from './state/types';
import { useToday } from './state/useToday';
import { MonthView } from './views/MonthView';
import { ScheduleView } from './views/ScheduleView';
import { TasksView } from './views/TasksView';
import { TodayView } from './views/TodayView';
import { WeekView } from './views/WeekView';

type Tab = 'today' | 'week' | 'month' | 'tasks' | 'schedule';

const TABS: { id: Tab; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { id: 'today', label: 'Today', icon: Sun },
  { id: 'week', label: 'Week', icon: CalendarDays },
  { id: 'month', label: 'Month', icon: CalendarRange },
  { id: 'tasks', label: 'Tasks', icon: ListTodo },
  { id: 'schedule', label: 'Schedule', icon: Clock },
];

type Dialog =
  | { kind: 'task'; task?: Task }
  | { kind: 'bulk' }
  | { kind: 'day'; date?: ISODate }
  | { kind: 'event'; event?: CalendarEvent; date?: ISODate }
  | { kind: 'import' }
  | null;

function tabFromHash(): Tab {
  const hash = window.location.hash.replace('#', '');
  return TABS.some((t) => t.id === hash) ? (hash as Tab) : 'today';
}

export default function App() {
  const { data, dispatch } = useStore();
  const today = useToday();
  const plan = useMemo(() => planFor(data, today), [data, today]);
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [dialog, setDialog] = useState<Dialog>(null);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (next: Tab) => {
    setTab(next);
    window.history.replaceState(null, '', `#${next}`);
    window.scrollTo({ top: 0 });
  };

  const close = useCallback(() => setDialog(null), []);
  const addTask = () => setDialog({ kind: 'task' });
  const addMany = () => setDialog({ kind: 'bulk' });
  const editTask = (task: Task) => setDialog({ kind: 'task', task });
  const editDay = (date?: ISODate) => setDialog({ kind: 'day', date });
  const editEvent = (event?: CalendarEvent) => setDialog({ kind: 'event', event });
  const addEventOn = (date: ISODate) => setDialog({ kind: 'event', date });
  const importCalendar = () => setDialog({ kind: 'import' });
  const loadSample = () => {
    if (hasUserData(data) && !window.confirm('Replace your current tasks, hours and events with sample data?')) return;
    dispatch({ type: 'data/replace', data: createSampleData(today) });
    go('today');
  };

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 pt-3">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <CalendarCheck className="size-5" />
            </span>
            <span className="font-semibold tracking-tight">Smart Calendar</span>
          </div>
        </div>
        <nav className="mx-auto max-w-4xl px-2 sm:px-4" aria-label="Main">
          <ul className="flex">
            {TABS.map(({ id, label, icon: Icon }) => (
              <li key={id} className="flex-1 sm:flex-none">
                <button
                  type="button"
                  onClick={() => go(id)}
                  aria-current={tab === id ? 'page' : undefined}
                  className={cx(
                    'flex w-full items-center justify-center gap-1.5 border-b-2 px-3 py-3 text-sm font-medium transition-colors sm:justify-start',
                    tab === id
                      ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-300'
                      : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
                  )}
                >
                  <Icon className="hidden size-4 sm:block" />
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="mx-auto max-w-4xl px-4 pt-5 pb-28">
        {tab === 'today' && (
          <TodayView
            plan={plan}
            onAddTask={addTask}
            onEditTask={editTask}
            onEditDay={editDay}
            onLoadSample={loadSample}
          />
        )}
        {tab === 'week' && <WeekView plan={plan} onEditDay={editDay} onEditTask={editTask} />}
        {tab === 'month' && (
          <MonthView plan={plan} onEditTask={editTask} onEditDay={editDay} onEditEvent={editEvent} onAddEvent={addEventOn} />
        )}
        {tab === 'tasks' && (
          <TasksView plan={plan} onAddTask={addTask} onAddMany={addMany} onImport={importCalendar} onEditTask={editTask} />
        )}
        {tab === 'schedule' && (
          <ScheduleView
            today={today}
            onEditDay={editDay}
            onEditEvent={editEvent}
            onImport={importCalendar}
            onLoadSample={loadSample}
          />
        )}
      </main>

      {tab !== 'schedule' && (
        <button
          type="button"
          onClick={addTask}
          className="fixed right-5 bottom-5 z-30 flex size-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 transition hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 sm:right-8 sm:bottom-8"
          aria-label="Add task"
        >
          <Plus className="size-6" />
        </button>
      )}

      {dialog?.kind === 'task' && <TaskForm task={dialog.task} today={today} onClose={close} onAddMany={addMany} />}
      {dialog?.kind === 'bulk' && <BulkTaskForm today={today} onClose={close} />}
      {dialog?.kind === 'day' && <DayHoursDialog date={dialog.date} today={today} onClose={close} />}
      {dialog?.kind === 'event' && (
        <EventForm event={dialog.event} defaultDate={dialog.date} today={today} onClose={close} />
      )}
      {dialog?.kind === 'import' && <ImportCalendarDialog today={today} onClose={close} />}
    </div>
  );
}
