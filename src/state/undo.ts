import { formatDate } from '../lib/dates';
import { formatDuration } from '../lib/time';
import type { StoreAction } from './context';
import { reducer, timerMinutes, type Action } from './reducer';
import type { AppData } from './types';

/** What an action did, in words for an Undo toast, or null if it isn't worth offering Undo for. */
export function undoLabel(action: Action, before: AppData): string | null {
  const task = (id: string) => before.tasks.find((t) => t.id === id)?.title ?? 'task';
  switch (action.type) {
    case 'work/log':
      return `Logged ${formatDuration(action.minutes)} on "${task(action.taskId)}"`;
    case 'task/setComplete':
      return action.complete ? `Finished "${task(action.id)}"` : null;
    case 'task/delete':
      return `Deleted "${task(action.id)}"`;
    case 'task/skip':
      return `Skipped "${task(action.id)}"`;
    case 'task/push':
      return `Pushed "${task(action.id)}" to tomorrow`;
    case 'task/plan':
      return action.date
        ? `Moved "${task(action.id)}" to ${formatDate(action.date, { weekday: 'short', month: 'short', day: 'numeric' })}`
        : null;
    case 'timer/start':
    case 'timer/stop': {
      // Starting a timer on another task stops the running one, so that's worth undoing too.
      const timer = before.timer;
      if (!timer || timer.taskId === (action.type === 'timer/start' ? action.taskId : '')) return null;
      const minutes = timerMinutes(timer.startedAt, action.at);
      return minutes >= 1 ? `Logged ${formatDuration(minutes)} on "${task(timer.taskId)}"` : null;
    }
    case 'timer/cancel':
      return before.timer ? `Stopped the timer on "${task(before.timer.taskId)}" without logging` : null;
    case 'event/delete':
      return `Deleted "${before.events.find((e) => e.id === action.id)?.title ?? 'event'}"`;
    case 'feed/remove':
      return `Removed the ${before.feeds?.find((f) => f.id === action.id)?.name ?? 'calendar'} link`;
    case 'series/stop':
      return `Stopped repeating "${before.series?.find((s) => s.id === action.id)?.title ?? 'task'}"`;
    default:
      return null;
  }
}

export interface StoreState {
  data: AppData;
  undo: { label: string; id: number; before: AppData } | null;
}

export function storeReducer(state: StoreState, action: StoreAction): StoreState {
  if (action.type === 'undo') return state.undo ? { data: state.undo.before, undo: null } : state;
  if (action.type === 'undo/dismiss') return state.undo ? { ...state, undo: null } : state;
  const data = reducer(state.data, action);
  if (data === state.data) return state;
  const label = undoLabel(action, state.data);
  if (label) return { data, undo: { label, id: (state.undo?.id ?? 0) + 1, before: state.data } };
  // Keeping repeating tasks up to date happens on its own, so it doesn't take away the Undo offer.
  return { data, undo: action.type === 'series/fill' ? state.undo : null };
}

