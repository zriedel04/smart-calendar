import type { CloudStore } from './engine';
import { ALREADY_SIGNED_UP, passwordErrorMessage, signInErrorMessage } from './errors';

export interface SyncUser {
  id: string;
  email: string | null;
}

/** Accounts plus the account's saved calendar. Supabase in the app; a fake in tests. */
export interface SyncBackend {
  currentUser(): Promise<SyncUser | null>;
  /** Calls back when someone signs in or out, including finishing sign-in from an emailed link. */
  onUserChange(callback: (user: SyncUser | null) => void): () => void;
  /** Emails a sign-in link. Resolves to an error message, or null once it's sent. */
  signIn(email: string): Promise<string | null>;
  /** Resolves to an error message, or null once signed in. */
  signInWithPassword(email: string, password: string): Promise<string | null>;
  /** Makes an account. Resolves to an error message, 'confirm' when the account must be confirmed by email first, or null once signed in. */
  signUp(email: string, password: string): Promise<string | 'confirm' | null>;
  /** Sets or changes the signed-in account's password. Resolves to an error message, or null once saved. */
  setPassword(password: string): Promise<string | null>;
  signOut(): Promise<void>;
  store(userId: string): CloudStore;
  /** Calls back when another device saves this account's calendar. */
  onRemoteChange(userId: string, callback: (version: number) => void): () => void;
  /** Fetches a calendar link's .ics text. Rejects with a message to show if it can't. */
  fetchFeed(url: string): Promise<string>;
}

/**
 * Accounts through Supabase. The Supabase library is loaded the first time it's needed, so it
 * doesn't slow down opening the app.
 */
export function supabaseBackend(): SyncBackend {
  const load = () => import('./supabaseStore').then((m) => ({ db: m.supabase(), store: m.supabaseStore }));
  const toUser = (user: { id: string; email?: string } | null | undefined): SyncUser | null =>
    user ? { id: user.id, email: user.email ?? null } : null;
  /** Runs an async subscription and returns a cleanup that works even if it hasn't started yet. */
  const subscribeLater = (start: () => Promise<() => void>) => {
    let stop: (() => void) | null = null;
    let cancelled = false;
    void start().then((unsubscribe) => (cancelled ? unsubscribe() : (stop = unsubscribe)));
    return () => {
      cancelled = true;
      stop?.();
    };
  };

  return {
    async currentUser() {
      const { db } = await load();
      const { data } = await db.auth.getSession();
      return toUser(data.session?.user);
    },
    onUserChange(callback) {
      return subscribeLater(async () => {
        const { db } = await load();
        const { data } = db.auth.onAuthStateChange((_event, session) => callback(toUser(session?.user)));
        return () => data.subscription.unsubscribe();
      });
    },
    async signIn(email) {
      const { db } = await load();
      const { error } = await db.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}` },
      });
      return error ? signInErrorMessage(error) : null;
    },
    async signInWithPassword(email, password) {
      const { db } = await load();
      const { error } = await db.auth.signInWithPassword({ email, password });
      return error ? passwordErrorMessage(error) : null;
    },
    async signUp(email, password) {
      const { db } = await load();
      const { data, error } = await db.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}` },
      });
      if (error) return passwordErrorMessage(error);
      // With email confirmation on, an address that already has an account comes back with no identities.
      if (data.user && data.user.identities?.length === 0) return ALREADY_SIGNED_UP;
      return data.session ? null : 'confirm';
    },
    async setPassword(password) {
      const { db } = await load();
      const { error } = await db.auth.updateUser({ password });
      return error ? passwordErrorMessage(error) : null;
    },
    async signOut() {
      const { db } = await load();
      await db.auth.signOut();
    },
    store(userId) {
      const store = load().then((m) => m.store(m.db, userId));
      return {
        fetch: () => store.then((s) => s.fetch()),
        create: (data) => store.then((s) => s.create(data)),
        update: (data, version) => store.then((s) => s.update(data, version)),
      };
    },
    async fetchFeed(url) {
      const { db } = await load();
      const { data, error } = await db.functions.invoke<string>('fetch-feed', { body: { url } });
      if (!error) return String(data ?? '');
      // The function's own message says what was wrong with the link.
      const response = (error as { context?: unknown }).context;
      if (response instanceof Response) {
        if (response.status === 404) throw new Error("Calendar links aren't set up for this app yet.");
        const message = await response.text().catch(() => '');
        if (message) throw new Error(message);
      }
      throw new Error("Couldn't reach the calendar link service. Check your connection and try again.");
    },
    onRemoteChange(userId, callback) {
      return subscribeLater(async () => {
        const { db } = await load();
        const channel = db
          .channel(`calendar-${userId}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'calendar_data', filter: `user_id=eq.${userId}` },
            (payload) => callback(Number((payload.new as { version?: number }).version ?? 0)),
          )
          .subscribe();
        return () => void db.removeChannel(channel);
      });
    },
  };
}
