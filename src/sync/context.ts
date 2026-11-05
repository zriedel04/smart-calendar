import { createContext, useContext } from 'react';
import type { FirstSyncChoice, RemoteCalendar } from './engine';

export type SyncStatus = 'signed-out' | 'syncing' | 'synced' | 'offline' | 'error';

export interface SyncValue {
  /** False when the app runs without an account service, such as in tests. */
  available: boolean;
  status: SyncStatus;
  email: string | null;
  /** When this device last agreed with the account, as a timestamp. */
  lastSynced: number | null;
  error: string | null;
  /** Set on a device's first sync when it and the account both have a different calendar. */
  conflict: RemoteCalendar | null;
  /** True after closing the question without choosing: nothing syncs until a calendar is chosen. */
  conflictPostponed: boolean;
  /** Emails a sign-in link. Resolves to an error message, or null once it's sent. */
  signIn: (email: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  resolveConflict: (choice: FirstSyncChoice) => void;
  /** Closes the question without choosing; it can be opened again from the account card. */
  postponeConflict: () => void;
  reopenConflict: () => void;
  syncNow: () => void;
  /** Fetches a calendar link's .ics text. Null when signed out, since only accounts can use calendar links. */
  fetchFeed: ((url: string) => Promise<string>) | null;
}

const noop = () => {};

export const SyncContext = createContext<SyncValue>({
  available: false,
  status: 'signed-out',
  email: null,
  lastSynced: null,
  error: null,
  conflict: null,
  conflictPostponed: false,
  signIn: async () => 'Accounts aren\'t available here.',
  signOut: async () => {},
  resolveConflict: noop,
  postponeConflict: noop,
  reopenConflict: noop,
  syncNow: noop,
  fetchFeed: null,
});

export const useSync = () => useContext(SyncContext);
