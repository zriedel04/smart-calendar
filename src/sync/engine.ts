import { hasUserData } from '../state/defaults';
import type { AppData } from '../state/types';
import { mergeAppData, sameData } from './merge';

/** The calendar saved in the account, and how many times it has been saved. */
export interface RemoteCalendar {
  data: AppData;
  version: number;
}

/** Where the account's calendar is kept. The app uses Supabase; tests use an in-memory one. */
export interface CloudStore {
  fetch(): Promise<RemoteCalendar | null>;
  /** Saves the first copy. Returns false if the account already has one. */
  create(data: AppData): Promise<boolean>;
  /** Saves over `version`. Returns the new version, or null if another device saved first. */
  update(data: AppData, version: number): Promise<number | null>;
}

/** What this device last agreed with the account on. */
export interface SyncState {
  version: number;
  base: AppData;
}

export type SyncResult =
  /** `data` is what this device should now show. */
  | { kind: 'synced'; data: AppData; state: SyncState }
  /** First sync on this device, and both it and the account already have different calendars. */
  | { kind: 'choose'; remote: RemoteCalendar };

/** Which calendar to keep the first time a device with its own data signs in to an account that has one. */
export type FirstSyncChoice = 'device' | 'account';

const ATTEMPTS = 3;

/**
 * Brings this device and the account into agreement.
 *
 * After the first sync, changes from both sides are merged item by item against the last version
 * both agreed on, so working offline on two devices loses nothing. Saves are checked against the
 * version they started from, so a device can't overwrite a save it hasn't seen.
 */
export async function syncCalendar(
  store: CloudStore,
  local: AppData,
  state: SyncState | null,
  choice?: FirstSyncChoice,
): Promise<SyncResult> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const remote = await store.fetch();
    if (!remote) {
      if (await store.create(local)) return { kind: 'synced', data: local, state: { version: 1, base: local } };
      continue; // Another device made the first copy just now.
    }

    let next: AppData;
    if (state) {
      next = remote.version === state.version ? local : mergeAppData(state.base, local, remote.data);
    } else if (choice === 'account' || !hasUserData(local) || sameData(local, remote.data)) {
      next = remote.data;
    } else if (choice === 'device') {
      next = local;
    } else {
      return { kind: 'choose', remote };
    }

    if (sameData(next, remote.data)) {
      return { kind: 'synced', data: sameData(next, local) ? local : remote.data, state: { version: remote.version, base: remote.data } };
    }
    const version = await store.update(next, remote.version);
    if (version !== null) return { kind: 'synced', data: next, state: { version, base: next } };
    // Another device saved in between: go again with what it saved.
  }
  throw new Error('Another device kept saving at the same time. Try again in a moment.');
}
