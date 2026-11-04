import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { parseAppData } from '../state/storage';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config';
import type { CloudStore } from './engine';

const TABLE = 'calendar_data';

let client: SupabaseClient | null = null;

/** The app's one Supabase client, made the first time it's needed. */
export function supabase(): SupabaseClient {
  client ??= createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}

/** Reads and saves one account's calendar row. Row-level security keeps it to that account. */
export function supabaseStore(db: SupabaseClient, userId: string): CloudStore {
  return {
    async fetch() {
      const { data, error } = await db.from(TABLE).select('data, version').eq('user_id', userId).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return { data: parseAppData(JSON.stringify(data.data)), version: Number(data.version) };
    },
    async create(data) {
      const { error } = await db.from(TABLE).insert({ user_id: userId, data, version: 1 });
      // 23505: the row already exists, made by another device.
      if (error?.code === '23505') return false;
      if (error) throw error;
      return true;
    },
    async update(data, version) {
      const { data: rows, error } = await db
        .from(TABLE)
        .update({ data, version: version + 1 })
        .eq('user_id', userId)
        .eq('version', version)
        .select('version');
      if (error) throw error;
      return rows.length ? Number(rows[0]!.version) : null;
    },
  };
}
