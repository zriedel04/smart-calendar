import { parseAppData } from '../state/storage';
import type { SyncState } from './engine';

const stateKey = (userId: string) => `smart-calendar:sync:${userId}`;

/** What this device last agreed with the account on, kept so later syncs can merge instead of overwrite. */
export function loadSyncState(userId: string): SyncState | null {
  try {
    const raw = globalThis.localStorage?.getItem(stateKey(userId));
    if (!raw) return null;
    const saved = JSON.parse(raw) as { version?: unknown; base?: unknown };
    if (typeof saved.version !== 'number') return null;
    return { version: saved.version, base: parseAppData(JSON.stringify(saved.base)) };
  } catch {
    return null;
  }
}

export function saveSyncState(userId: string, state: SyncState | null) {
  try {
    if (state) globalThis.localStorage?.setItem(stateKey(userId), JSON.stringify(state));
    else globalThis.localStorage?.removeItem(stateKey(userId));
  } catch {
    // Without storage the next sync is treated as a first sync, which still loses nothing.
  }
}
