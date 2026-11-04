/** Supabase reports errors as plain objects with a message, not as Error instances, so read either. */
export function errorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string' && e.message) {
    const code = 'code' in e && typeof e.code === 'string' && e.code ? ` (${e.code})` : '';
    return e.message + code;
  }
  return "Couldn't reach your account.";
}
