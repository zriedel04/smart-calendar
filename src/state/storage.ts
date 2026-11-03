import { isISODate } from '../lib/dates';
import type { TimeRange } from '../lib/time';
import { createEmptyData } from './defaults';
import type { AppData } from './types';

/**
 * Where app data lives. v1 keeps everything in the browser; swapping in a
 * cloud-backed adapter later (for syncing across devices) only means writing
 * another implementation of this interface.
 */
export interface StorageAdapter {
  load(): AppData | null;
  save(data: AppData): void;
  /** Calls `onChange` when the data is changed somewhere else, such as another open tab. Returns an unsubscribe function. */
  subscribe?(onChange: (data: AppData) => void): () => void;
}

export const STORAGE_KEY = 'smart-calendar:data';

export function createLocalStorageAdapter(key: string = STORAGE_KEY): StorageAdapter {
  return {
    load() {
      try {
        const raw = globalThis.localStorage?.getItem(key);
        return raw ? parseAppData(raw) : null;
      } catch {
        return null;
      }
    },
    save(data) {
      try {
        globalThis.localStorage?.setItem(key, JSON.stringify(data));
      } catch {
        // Storage can be full or blocked (private browsing). The app keeps working in memory.
      }
    },
    subscribe(onChange) {
      if (typeof window === 'undefined') return () => {};
      // The storage event fires in every other tab of this site when one tab saves.
      const onStorage = (event: StorageEvent) => {
        if (event.key !== key || event.newValue === null) return;
        try {
          onChange(parseAppData(event.newValue));
        } catch {
          // Ignore values that aren't valid app data.
        }
      };
      window.addEventListener('storage', onStorage);
      return () => window.removeEventListener('storage', onStorage);
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRange(value: unknown): value is TimeRange {
  return (
    isRecord(value) &&
    typeof value.start === 'number' &&
    typeof value.end === 'number' &&
    value.end > value.start
  );
}

function ranges(value: unknown): TimeRange[] {
  return Array.isArray(value) ? value.filter(isRange).map(({ start, end }) => ({ start, end })) : [];
}

/**
 * Parses saved or imported JSON into valid app data. Anything malformed is dropped
 * rather than crashing the app. Throws only when the input isn't app data at all.
 */
export function parseAppData(json: string): AppData {
  const value: unknown = JSON.parse(json);
  if (!isRecord(value) || value.version !== 1) {
    throw new Error('This file is not Smart Calendar data.');
  }
  const fallback = createEmptyData();

  const tasks = Array.isArray(value.tasks)
    ? value.tasks.filter(
        (t): t is AppData['tasks'][number] =>
          isRecord(t) &&
          typeof t.id === 'string' &&
          typeof t.title === 'string' &&
          isISODate(t.dueDate) &&
          typeof t.estimateMinutes === 'number' &&
          t.estimateMinutes > 0 &&
          typeof t.createdAt === 'string',
      )
    : [];

  const taskIds = new Set(tasks.map((t) => t.id));
  const logs = Array.isArray(value.logs)
    ? value.logs.filter(
        (l): l is AppData['logs'][number] =>
          isRecord(l) &&
          typeof l.id === 'string' &&
          typeof l.taskId === 'string' &&
          taskIds.has(l.taskId) &&
          isISODate(l.date) &&
          typeof l.minutes === 'number' &&
          l.minutes > 0,
      )
    : [];

  const weeklyHours =
    Array.isArray(value.weeklyHours) && value.weeklyHours.length === 7
      ? value.weeklyHours.map(ranges)
      : fallback.weeklyHours;

  const overrides: Record<string, TimeRange[]> = {};
  if (isRecord(value.overrides)) {
    for (const [date, list] of Object.entries(value.overrides)) {
      if (isISODate(date)) overrides[date] = ranges(list);
    }
  }

  const events = Array.isArray(value.events)
    ? value.events.filter(
        (e): e is AppData['events'][number] =>
          isRecord(e) &&
          typeof e.id === 'string' &&
          typeof e.title === 'string' &&
          isISODate(e.date) &&
          isRange(e) &&
          (e.repeat === 'none' || e.repeat === 'weekly'),
      )
    : [];

  return { version: 1, tasks, logs, weeklyHours, overrides, events };
}
