import type { CalendarEvent } from '../lib/availability';
import { addDays, type ISODate, type Weekday } from '../lib/dates';
import type { TimeRange } from '../lib/time';
import { createId } from './ids';
import { fillSeries, startedTaskIds } from './recurring';
import type { IcsEntry } from '../lib/ics';
import { applyFeed, dismissFromFeed } from './feeds';
import type { AppData, CalendarFeed, Task, TaskSeries } from './types';

export type TaskDraft = Pick<Task, 'title' | 'dueDate' | 'estimateMinutes' | 'notes' | 'sourceId' | 'planDate'>;
export type EventDraft = Omit<CalendarEvent, 'id'>;
export type SeriesDraft = Pick<TaskSeries, 'title' | 'estimateMinutes' | 'notes' | 'days' | 'startDate' | 'until'>;

export type Action =
  | { type: 'task/add'; draft: TaskDraft }
  | { type: 'task/update'; id: string; draft: TaskDraft }
  | { type: 'task/delete'; id: string }
  | { type: 'task/setComplete'; id: string; complete: boolean }
  | { type: 'task/push'; id: string; until: ISODate }
  | { type: 'task/unpush'; id: string }
  | { type: 'task/plan'; id: string; date: ISODate | null }
  | { type: 'task/skip'; id: string }
  | { type: 'work/log'; taskId: string; date: ISODate; minutes: number }
  | { type: 'work/undoDay'; taskId: string; date: ISODate }
  | { type: 'timer/start'; taskId: string; at: string; date: ISODate }
  | { type: 'timer/stop'; at: string; date: ISODate }
  | { type: 'timer/cancel'; date: ISODate }
  | { type: 'hours/setWeekday'; weekday: Weekday; ranges: TimeRange[] }
  | { type: 'hours/setWeek'; weeklyHours: TimeRange[][] }
  | { type: 'hours/setOverride'; date: ISODate; ranges: TimeRange[] }
  | { type: 'hours/clearOverride'; date: ISODate }
  | { type: 'event/add'; draft: EventDraft }
  | { type: 'event/update'; id: string; draft: EventDraft }
  | { type: 'event/delete'; id: string }
  | { type: 'import/add'; tasks: TaskDraft[]; events: EventDraft[] }
  | { type: 'series/add'; draft: SeriesDraft; today: ISODate; replacesTaskId?: string }
  | { type: 'series/update'; id: string; draft: SeriesDraft; today: ISODate }
  | { type: 'series/stop'; id: string; today: ISODate }
  | { type: 'series/fill'; today: ISODate }
  | { type: 'feed/add'; feed: CalendarFeed }
  | { type: 'feed/remove'; id: string }
  | { type: 'feed/apply'; id: string; entries: IcsEntry[]; today: ISODate; at: string }
  | { type: 'data/replace'; data: AppData };

/** Whole minutes a timer has run by `at`. */
export function timerMinutes(startedAt: string, at: string): number {
  return Math.max(0, Math.floor((Date.parse(at) - Date.parse(startedAt)) / 60_000));
}

/** Stops the running timer, logging its time on `date` if it ran at least a minute. */
function stopTimer(state: AppData, at: string, date: ISODate): AppData {
  if (!state.timer) return state;
  const { timer, ...rest } = state;
  const minutes = timerMinutes(timer.startedAt, at);
  if (minutes < 1 || !state.tasks.some((t) => t.id === timer.taskId)) return rest;
  // The log's id comes from the timer itself, so if two synced devices both stop the same timer,
  // merging keeps one log for it instead of counting the time twice.
  const id = `timer:${timer.taskId}:${timer.startedAt}`;
  return { ...rest, logs: [...state.logs, { id, taskId: timer.taskId, date, minutes }] };
}

/**
 * A repeating task's past day is kept while its timer runs past midnight. Once the timer ends,
 * tidy it the usual way: finished if time was logged on it, otherwise removed.
 */
function tidyAfterTimer(before: AppData, after: AppData, today: ISODate): AppData {
  const timed = before.tasks.find((t) => t.id === before.timer?.taskId);
  return timed?.seriesId && timed.dueDate < today ? fillSeries(after, today) : after;
}

/** Drops the running timer if it's on this task. */
function withoutTimerOn(state: AppData, taskId: string): AppData {
  if (state.timer?.taskId !== taskId) return state;
  const { timer: _timer, ...rest } = state;
  return rest;
}

/** Removes a series' copies from today on that you haven't started or finished. */
function dropUpcomingCopies(state: AppData, seriesId: string, today: ISODate): Task[] {
  const started = startedTaskIds(state);
  return state.tasks.filter(
    (t) => t.seriesId !== seriesId || t.dueDate < today || t.completedAt !== undefined || started.has(t.id),
  );
}

export function reducer(state: AppData, action: Action): AppData {
  const next = apply(state, action);
  // A timer can't outlive its task, such as a repeating task's day you skipped.
  if (next.timer && next !== state && !next.tasks.some((t) => t.id === next.timer!.taskId)) {
    return withoutTimerOn(next, next.timer.taskId);
  }
  return next;
}

function apply(state: AppData, action: Action): AppData {
  switch (action.type) {
    case 'task/add':
      return {
        ...state,
        tasks: [
          ...state.tasks,
          { ...action.draft, id: createId(), createdAt: new Date().toISOString() },
        ],
      };
    case 'task/update':
      return {
        ...state,
        tasks: state.tasks.map((t) => {
          if (t.id !== action.id) return t;
          if (!action.draft.planDate) return { ...t, ...action.draft };
          // Choosing a day to work on it replaces pushing it off.
          const { notBefore: _notBefore, ...rest } = t;
          return { ...rest, ...action.draft };
        }),
      };
    case 'task/delete': {
      const deleted = state.tasks.find((t) => t.id === action.id);
      return {
        ...withoutTimerOn(state, action.id),
        ...(deleted?.feedId ? { feeds: dismissFromFeed(state, deleted) } : {}),
        tasks: state.tasks.filter((t) => t.id !== action.id),
        logs: state.logs.filter((l) => l.taskId !== action.id),
      };
    }
    case 'task/setComplete':
      return {
        ...(action.complete ? withoutTimerOn(state, action.id) : state),
        tasks: state.tasks.map((t) => {
          if (t.id !== action.id) return t;
          if (action.complete) return { ...t, completedAt: new Date().toISOString() };
          const { completedAt: _completedAt, ...rest } = t;
          return rest;
        }),
      };
    case 'task/push':
      // Pushing replaces any day you chose for it, which would otherwise keep it on today's list.
      return {
        ...state,
        tasks: state.tasks.map((t) => {
          if (t.id !== action.id) return t;
          const { planDate: _planDate, ...rest } = t;
          return { ...rest, notBefore: action.until };
        }),
      };
    case 'task/plan':
      return {
        ...state,
        tasks: state.tasks.map((t) => {
          if (t.id !== action.id || t.seriesId) return t;
          const { planDate: _planDate, ...rest } = t;
          if (!action.date) return rest;
          // Choosing a day to work on it replaces pushing it off, which could keep it off that day.
          const { notBefore: _notBefore, ...unpushed } = rest;
          return { ...unpushed, planDate: action.date };
        }),
      };
    case 'task/unpush':
      return {
        ...state,
        tasks: state.tasks.map((t) => {
          if (t.id !== action.id) return t;
          const { notBefore: _notBefore, ...rest } = t;
          return rest;
        }),
      };
    case 'task/skip': {
      // Skipping the day ends its timer without logging, whether the copy is removed or kept as finished.
      state = withoutTimerOn(state, action.id);
      // Skipping a day of a repeating task removes it, unless you logged time on it: then it's kept
      // as finished so that time isn't lost.
      if (!state.logs.some((l) => l.taskId === action.id)) {
        const task = state.tasks.find((t) => t.id === action.id);
        // Remember the day, so remaking the series' copies after an edit doesn't bring it back.
        const series = (state.series ?? []).map((s) =>
          task && s.id === task.seriesId ? { ...s, skipped: [...(s.skipped ?? []), task.dueDate] } : s,
        );
        return { ...state, series, tasks: state.tasks.filter((t) => t.id !== action.id) };
      }
      const completedAt = new Date().toISOString();
      return { ...state, tasks: state.tasks.map((t) => (t.id === action.id ? { ...t, completedAt } : t)) };
    }
    case 'work/log':
      if (action.minutes <= 0) return state;
      return {
        // Logging time by hand on the timed task replaces what the timer would have logged.
        ...withoutTimerOn(state, action.taskId),
        logs: [
          ...state.logs,
          { id: createId(), taskId: action.taskId, date: action.date, minutes: action.minutes },
        ],
      };
    case 'work/undoDay': {
      const tasks = state.tasks.map((t) => {
        if (t.id !== action.taskId || !t.completedAt) return t;
        const { completedAt: _completedAt, ...rest } = t;
        return rest;
      });
      return {
        ...state,
        tasks,
        logs: state.logs.filter((l) => !(l.taskId === action.taskId && l.date === action.date)),
      };
    }
    case 'timer/start': {
      if (state.timer?.taskId === action.taskId || !state.tasks.some((t) => t.id === action.taskId)) return state;
      // Only one timer runs at a time: starting another logs the one that was running.
      const stopped = tidyAfterTimer(state, stopTimer(state, action.at, action.date), action.date);
      return { ...stopped, timer: { taskId: action.taskId, startedAt: action.at } };
    }
    case 'timer/stop':
      return tidyAfterTimer(state, stopTimer(state, action.at, action.date), action.date);
    case 'timer/cancel':
      return state.timer ? tidyAfterTimer(state, withoutTimerOn(state, state.timer.taskId), action.date) : state;
    case 'hours/setWeekday':
      return {
        ...state,
        weeklyHours: state.weeklyHours.map((r, i) => (i === action.weekday ? action.ranges : r)),
      };
    case 'hours/setWeek':
      return { ...state, weeklyHours: action.weeklyHours };
    case 'hours/setOverride':
      return { ...state, overrides: { ...state.overrides, [action.date]: action.ranges } };
    case 'hours/clearOverride': {
      const { [action.date]: _removed, ...overrides } = state.overrides;
      return { ...state, overrides };
    }
    case 'event/add':
      return { ...state, events: [...state.events, { ...action.draft, id: createId() }] };
    case 'event/update':
      return {
        ...state,
        events: state.events.map((e) =>
          e.id === action.id
            ? {
                ...action.draft,
                id: e.id,
                sourceId: action.draft.sourceId ?? e.sourceId,
                ...(e.feedId ? { feedId: e.feedId, sourceStamp: e.sourceStamp } : {}),
              }
            : e,
        ),
      };
    case 'event/delete': {
      const deleted = state.events.find((e) => e.id === action.id);
      return {
        ...state,
        ...(deleted?.feedId ? { feeds: dismissFromFeed(state, deleted) } : {}),
        events: state.events.filter((e) => e.id !== action.id),
      };
    }
    case 'import/add': {
      const createdAt = new Date().toISOString();
      return {
        ...state,
        tasks: [...state.tasks, ...action.tasks.map((draft) => ({ ...draft, id: createId(), createdAt }))],
        events: [...state.events, ...action.events.map((draft) => ({ ...draft, id: createId() }))],
      };
    }
    case 'series/add': {
      const createdAt = new Date().toISOString();
      const series: TaskSeries = { ...action.draft, id: createId(), createdAt };
      let { tasks, logs } = state;
      // A one-off task turned into a repeating one is replaced by its copies, in the same step so a
      // single Undo can't leave both. If you started it, it's kept as finished instead, and a running
      // timer keeps going so stopping it still logs the time.
      const replaced = action.replacesTaskId;
      if (replaced && startedTaskIds(state).has(replaced)) {
        tasks = tasks.map((t) => (t.id === replaced ? { ...t, completedAt: createdAt } : t));
      } else if (replaced) {
        tasks = tasks.filter((t) => t.id !== replaced);
        logs = logs.filter((l) => l.taskId !== replaced);
      }
      return fillSeries({ ...state, tasks, logs, series: [...(state.series ?? []), series] }, action.today);
    }
    case 'series/update': {
      // Upcoming copies are made again from the new details; ones you started keep theirs.
      const tasks = dropUpcomingCopies(state, action.id, action.today);
      const series = (state.series ?? []).map((s) => {
        if (s.id !== action.id) return s;
        const { filledThrough: _filled, until: _until, notes: _notes, ...rest } = s;
        return { ...rest, ...action.draft, filledThrough: addDays(action.today, -1) };
      });
      return fillSeries({ ...state, tasks, series }, action.today);
    }
    case 'series/stop':
      return {
        ...state,
        tasks: dropUpcomingCopies(state, action.id, action.today),
        series: (state.series ?? []).filter((s) => s.id !== action.id),
      };
    case 'series/fill':
      return fillSeries(state, action.today);
    case 'feed/add':
      return { ...state, feeds: [...(state.feeds ?? []), action.feed] };
    case 'feed/remove': {
      // What the link added stays, as if imported from a file, but is no longer kept up to date.
      const detach = <T extends { feedId?: string; sourceStamp?: string }>(item: T): T => {
        if (item.feedId !== action.id) return item;
        const { feedId: _feed, sourceStamp: _stamp, ...rest } = item;
        return rest as T;
      };
      const feeds = (state.feeds ?? []).filter((f) => f.id !== action.id);
      const { feeds: _feeds, ...rest } = state;
      return { ...rest, ...(feeds.length ? { feeds } : {}), tasks: state.tasks.map(detach), events: state.events.map(detach) };
    }
    case 'feed/apply':
      return applyFeed(state, action.id, action.entries, action.today, action.at);
    case 'data/replace':
      return action.data;
  }
}
