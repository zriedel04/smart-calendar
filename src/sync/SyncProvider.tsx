import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../state/context';
import type { AppData } from '../state/types';
import type { SyncBackend, SyncUser } from './backend';
import { SyncContext, type SyncStatus, type SyncValue } from './context';
import { syncCalendar, type FirstSyncChoice, type RemoteCalendar, type SyncState } from './engine';
import { errorMessage } from './errors';
import { mergeAppData, sameData } from './merge';

/** How long to wait after a change before saving it to the account, so a burst of edits is one save. */
export const SAVE_DELAY_MS = 1500;

export interface SyncStateStore {
  load(userId: string): SyncState | null;
  save(userId: string, state: SyncState | null): void;
}

/**
 * Keeps this device's calendar in step with the signed-in account. Signing in is optional: signed
 * out, or offline, the app keeps working from the browser's copy and catches up later.
 */
export function SyncProvider({
  backend,
  syncState,
  children,
}: {
  backend: SyncBackend;
  syncState: SyncStateStore;
  children: ReactNode;
}) {
  const { data, dispatch } = useStore();
  const [user, setUser] = useState<SyncUser | null>(null);
  const [status, setStatus] = useState<SyncStatus>('signed-out');
  const [lastSynced, setLastSynced] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<RemoteCalendar | null>(null);

  // The sync loop reads these without re-subscribing on every change.
  const dataRef = useRef(data);
  const userRef = useRef(user);
  useLayoutEffect(() => {
    dataRef.current = data;
    userRef.current = user;
  });
  const running = useRef(false);
  const again = useRef(false);
  const knownVersion = useRef<number | null>(null);
  // Each open tab keeps its own checkpoint, paired with the calendar it actually holds. Another tab
  // can save a newer one before this tab has received that tab's calendar; using that newer
  // checkpoint with this tab's older calendar would upload the old calendar without merging.
  // The saved copy is only read once, when this tab first needs it.
  const checkpoints = useRef(new Map<string, SyncState | null>());
  const checkpoint = useCallback(
    (userId: string) => {
      if (!checkpoints.current.has(userId)) checkpoints.current.set(userId, syncState.load(userId));
      return checkpoints.current.get(userId) ?? null;
    },
    [syncState],
  );
  const setCheckpoint = useCallback(
    (userId: string, state: SyncState | null) => {
      checkpoints.current.set(userId, state);
      syncState.save(userId, state);
    },
    [syncState],
  );

  /** One pass: fetch, merge, save. Returns true if edits came in meanwhile and another pass is needed. */
  const syncOnce = useCallback(
    async (current: SyncUser, choice?: FirstSyncChoice): Promise<boolean> => {
      setStatus('syncing');
      try {
        const local = dataRef.current;
        const result = await syncCalendar(backend.store(current.id), local, checkpoint(current.id), choice);
        if (userRef.current?.id !== current.id) return false; // Signed out while saving.
        if (result.kind === 'choose') {
          setConflict(result.remote);
          setStatus('synced');
          return false;
        }
        setConflict(null);
        setCheckpoint(current.id, result.state);
        knownVersion.current = result.state.version;
        // Edits made while the sync was in flight are kept and saved on the next pass.
        const latest = dataRef.current;
        const changedMeanwhile = latest !== local;
        const next: AppData = changedMeanwhile ? mergeAppData(local, latest, result.data) : result.data;
        if (!sameData(next, latest)) dispatch({ type: 'data/replace', data: next });
        setError(null);
        setStatus('synced');
        setLastSynced(Date.now());
        return changedMeanwhile;
      } catch (e) {
        const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
        setStatus(offline ? 'offline' : 'error');
        setError(offline ? null : errorMessage(e));
        return false;
      }
    },
    [backend, checkpoint, setCheckpoint, dispatch],
  );

  const run = useCallback(
    async (choice?: FirstSyncChoice) => {
      const current = userRef.current;
      if (!current) return;
      if (running.current) {
        again.current = true;
        return;
      }
      running.current = true;
      try {
        let more = await syncOnce(current, choice);
        while ((more || again.current) && userRef.current?.id === current.id) {
          again.current = false;
          more = await syncOnce(current);
        }
      } finally {
        running.current = false;
        again.current = false;
      }
    },
    [syncOnce],
  );

  // Follow sign-in and sign-out, including finishing sign-in from an emailed link.
  useEffect(() => {
    let active = true;
    void backend.currentUser().then((u) => active && setUser(u));
    const unsubscribe = backend.onUserChange((u) => setUser(u));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [backend]);

  // Sync when someone signs in, and listen for saves from their other devices.
  useEffect(() => {
    if (!user) {
      knownVersion.current = null;
      return;
    }
    void run();
    return backend.onRemoteChange(user.id, (version) => {
      // Our own saves come back here too; only another device's save is news.
      if (version !== knownVersion.current) void run();
    });
  }, [user, backend, run]);

  // Save changes made on this device, a moment after the last one.
  useEffect(() => {
    if (!user || conflict) return;
    const saved = checkpoint(user.id);
    if (saved && sameData(data, saved.base)) return;
    const timer = window.setTimeout(() => void run(), SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [data, user, conflict, checkpoint, run]);

  // Catch up when coming back to the app or back online.
  useEffect(() => {
    if (!user) return;
    const catchUp = () => {
      if (document.visibilityState === 'visible') void run();
    };
    document.addEventListener('visibilitychange', catchUp);
    window.addEventListener('online', catchUp);
    return () => {
      document.removeEventListener('visibilitychange', catchUp);
      window.removeEventListener('online', catchUp);
    };
  }, [user, run]);

  const value = useMemo<SyncValue>(
    () => ({
      available: true,
      // Signed out, any earlier sync status or question no longer applies.
      status: user ? status : 'signed-out',
      email: user?.email ?? null,
      lastSynced,
      error,
      conflict: user ? conflict : null,
      signIn: (email) => backend.signIn(email),
      signOut: async () => {
        const current = userRef.current;
        await backend.signOut();
        // This device keeps its calendar; signing in again starts with a fresh first sync.
        if (current) setCheckpoint(current.id, null);
        setUser(null);
      },
      resolveConflict: (choice) => {
        setConflict(null);
        void run(choice);
      },
      syncNow: () => void run(),
    }),
    [status, user, lastSynced, error, conflict, backend, setCheckpoint, run],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
