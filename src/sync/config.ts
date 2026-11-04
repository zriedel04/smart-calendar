/**
 * The Supabase project that keeps accounts and synced calendars. The publishable key is meant to be
 * public: it only lets the browser ask Supabase for things, and the database's row-level security
 * decides what each signed-in person can read or change. Forks can point at their own project with
 * VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.
 */
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? 'https://akaupwpjoezapanfzyyl.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY: string =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_RohVKI3P_DkukfptBeiZGw_RYo6tVK1';
