import type { AppData } from '../state/types';
import type { CloudStore, RemoteCalendar } from './engine';

/** An account's calendar kept in memory, standing in for Supabase in tests. */
export function memoryStore(initial: RemoteCalendar | null = null) {
  let row: RemoteCalendar | null = initial ? structuredClone(initial) : null;
  /** Runs once, just before the next save lands, to act like another device saving at the same moment. */
  let beforeNextSave: (() => void) | null = null;
  const store: CloudStore = {
    async fetch() {
      return row ? structuredClone(row) : null;
    },
    async create(data) {
      beforeNextSave?.();
      beforeNextSave = null;
      if (row) return false;
      row = { data: structuredClone(data), version: 1 };
      return true;
    },
    async update(data, version) {
      beforeNextSave?.();
      beforeNextSave = null;
      if (!row || row.version !== version) return null;
      row = { data: structuredClone(data), version: version + 1 };
      return row.version;
    },
  };
  return {
    store,
    get row() {
      return row;
    },
    /** Saves as if from another device. */
    saveFromElsewhere(data: AppData) {
      row = { data: structuredClone(data), version: (row?.version ?? 0) + 1 };
    },
    raceNextSave(fn: () => void) {
      beforeNextSave = fn;
    },
  };
}
