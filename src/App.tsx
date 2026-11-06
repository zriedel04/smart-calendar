import { CalendarCheck, CalendarPlus, CalendarDays, CalendarRange, Clock, ListTodo, Plus, Search, Sun } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { BulkTaskForm } from './components/BulkTaskForm';
import { DayHoursDialog } from './components/DayHoursDialog';
import { EventForm } from './components/EventForm';
import { ImportCalendarDialog } from './components/ImportCalendarDialog';
import { SearchDialog } from './components/SearchDialog';
import { TaskForm } from './components/TaskForm';
import { SyncConflictDialog } from './components/SyncConflictDialog';
import { TimerBar } from './components/TimerBar';
import { UndoToast } from './components/UndoToast';
import { cx } from './components/cx';
import { Button } from './components/ui';
import type { CalendarEvent } from './lib/availability';
import type { ISODate } from './lib/dates';
import { useStore } from './state/context';
import { createSampleData, hasUserData } from './state/defaults';
import { planFor } from './state/planner';
import type { Task, TaskSeries } from './state/types';
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
  | { kind: 'task'; task?: Task; series?: TaskSeries; due?: ISODate }
  | { kind: 'bulk' }
  | { kind: 'day'; date?: ISODate }
  | { kind: 'event'; event?: CalendarEvent; date?: ISODate; occurrence?: ISODate }
  | { kind: 'import' }
  | { kind: 'search' }
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

  // Keep repeating tasks' copies a week ahead, and clear missed ones, as days go by.
  useEffect(() => {
    dispatch({ type: 'series/fill', today });
  }, [dispatch, today, data.series]);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // The day picked on the month calendar, which the Event and Task buttons above use while it's shown.
  const [monthDay, setMonthDay] = useState<ISODate | null>(null);
  const go = (next: Tab) => {
    setTab(next);
    setMonthDay(null);
    window.history.replaceState(null, '', `#${next}`);
    window.scrollTo({ top: 0 });
  };

  const close = useCallback(() => setDialog(null), []);
  const addTask = () => setDialog({ kind: 'task', ...(tab === 'month' && monthDay ? { due: monthDay } : {}) });
  const addMany = () => setDialog({ kind: 'bulk' });
  const editTask = (task: Task) => setDialog({ kind: 'task', task });
  const editSeries = (series: TaskSeries) => setDialog({ kind: 'task', series });

  // "/" opens search, as on many sites, unless you're typing somewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      setDialog((current) => current ?? { kind: 'search' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const editDay = (date?: ISODate) => setDialog({ kind: 'day', date });
  const editEvent = (event?: CalendarEvent, occurrence?: ISODate) => setDialog({ kind: 'event', event, occurrence });
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
            {/* On phones the name makes room for the buttons; the logo stays. */}
            <span className="font-semibold tracking-tight whitespace-nowrap max-[409px]:sr-only">Smart Calendar</span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'search' })} aria-label="Search" title="Search (/)">
              <Search className="size-4" />
            </Button>
            <Button
              size="sm"
              onClick={() => (tab === 'month' && monthDay ? addEventOn(monthDay) : editEvent())}
              aria-label="Add event"
            >
              <CalendarPlus className="size-4" /> Event
            </Button>
            <Button size="sm" variant="primary" onClick={addTask} aria-label="Add task">
              <Plus className="size-4" /> Task
            </Button>
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
        <TimerBar />
      </header>

      <main className="mx-auto max-w-4xl px-4 pt-5 pb-28">
        {tab === 'today' && (
          <TodayView
            plan={plan}
            onAddTask={addTask}
            onEditTask={editTask}
            onEditDay={editDay}
            onLoadSample={loadSample}
            onOpenSchedule={() => go('schedule')}
          />
        )}
        {tab === 'week' && <WeekView plan={plan} onEditDay={editDay} onEditTask={editTask} />}
        {tab === 'month' && (
          <MonthView
            plan={plan}
            onEditTask={editTask}
            onEditDay={editDay}
            onEditEvent={editEvent}
            onAddEvent={addEventOn}
            onSelectDay={setMonthDay}
          />
        )}
        {tab === 'tasks' && (
          <TasksView plan={plan} onAddTask={addTask} onAddMany={addMany} onImport={importCalendar} onEditTask={editTask} onEditSeries={editSeries} />
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


      {dialog?.kind === 'task' && <TaskForm task={dialog.task} series={dialog.series} defaultDue={dialog.due} today={today} onClose={close} onAddMany={addMany} />}
      {dialog?.kind === 'bulk' && <BulkTaskForm today={today} onClose={close} />}
      {dialog?.kind === 'day' && <DayHoursDialog date={dialog.date} today={today} onClose={close} />}
      {dialog?.kind === 'event' && (
        <EventForm event={dialog.event} defaultDate={dialog.date} occurrence={dialog.occurrence} today={today} onClose={close} />
      )}
      {dialog?.kind === 'import' && <ImportCalendarDialog today={today} onClose={close} />}
      {dialog?.kind === 'search' && (
        <SearchDialog today={today} onClose={close} onOpenTask={editTask} onOpenSeries={editSeries} onOpenEvent={editEvent} />
      )}
      <SyncConflictDialog />
      <UndoToast />
    </div>
  );
}
