import type { CalendarEvent } from '../lib/availability';
import type { ISODate, Weekday } from '../lib/dates';
import type { TimeRange } from '../lib/time';
import { createId } from './ids';
import type { AppData, Task } from './types';

export type TaskDraft = Pick<Task, 'title' | 'dueDate' | 'estimateMinutes' | 'notes' | 'sourceId'>;
export type EventDraft = Omit<CalendarEvent, 'id'>;

export type Action =
  | { type: 'task/add'; draft: TaskDraft }
  | { type: 'task/update'; id: string; draft: TaskDraft }
  | { type: 'task/delete'; id: string }
  | { type: 'task/setComplete'; id: string; complete: boolean }
  | { type: 'task/push'; id: string; until: ISODate }
  | { type: 'task/unpush'; id: string }
  | { type: 'work/log'; taskId: string; date: ISODate; minutes: number }
  | { type: 'work/undoDay'; taskId: string; date: ISODate }
  | { type: 'hours/setWeekday'; weekday: Weekday; ranges: TimeRange[] }
  | { type: 'hours/setOverride'; date: ISODate; ranges: TimeRange[] }
  | { type: 'hours/clearOverride'; date: ISODate }
  | { type: 'event/add'; draft: EventDraft }
  | { type: 'event/update'; id: string; draft: EventDraft }
  | { type: 'event/delete'; id: string }
  | { type: 'import/add'; tasks: TaskDraft[]; events: EventDraft[] }
  | { type: 'data/replace'; data: AppData };

export function reducer(state: AppData, action: Action): AppData {
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
        tasks: state.tasks.map((t) => (t.id === action.id ? { ...t, ...action.draft } : t)),
      };
    case 'task/delete':
      return {
        ...state,
        tasks: state.tasks.filter((t) => t.id !== action.id),
        logs: state.logs.filter((l) => l.taskId !== action.id),
      };
    case 'task/setComplete':
      return {
        ...state,
        tasks: state.tasks.map((t) => {
          if (t.id !== action.id) return t;
          if (action.complete) return { ...t, completedAt: new Date().toISOString() };
          const { completedAt: _completedAt, ...rest } = t;
          return rest;
        }),
      };
    case 'task/push':
      return { ...state, tasks: state.tasks.map((t) => (t.id === action.id ? { ...t, notBefore: action.until } : t)) };
    case 'task/unpush':
      return {
        ...state,
        tasks: state.tasks.map((t) => {
          if (t.id !== action.id) return t;
          const { notBefore: _notBefore, ...rest } = t;
          return rest;
        }),
      };
    case 'work/log':
      if (action.minutes <= 0) return state;
      return {
        ...state,
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
    case 'hours/setWeekday':
      return {
        ...state,
        weeklyHours: state.weeklyHours.map((r, i) => (i === action.weekday ? action.ranges : r)),
      };
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
          e.id === action.id ? { ...action.draft, id: e.id, sourceId: action.draft.sourceId ?? e.sourceId } : e,
        ),
      };
    case 'event/delete':
      return { ...state, events: state.events.filter((e) => e.id !== action.id) };
    case 'import/add': {
      const createdAt = new Date().toISOString();
      return {
        ...state,
        tasks: [...state.tasks, ...action.tasks.map((draft) => ({ ...draft, id: createId(), createdAt }))],
        events: [...state.events, ...action.events.map((draft) => ({ ...draft, id: createId() }))],
      };
    }
    case 'data/replace':
      return action.data;
  }
}
