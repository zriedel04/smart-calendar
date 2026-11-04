/** Supabase reports errors as plain objects with a message, not as Error instances, so read either. */
export function errorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string' && e.message) {
    const code = 'code' in e && typeof e.code === 'string' && e.code ? ` (${e.code})` : '';
    return e.message + code;
  }
  return "Couldn't reach your account.";
}

/** What to show when a sign-in email couldn't be sent. */
export function signInErrorMessage(error: { message: string; code?: string; status?: number }): string {
  if (error.code === 'over_email_send_rate_limit' || error.status === 429) {
    return 'Too many sign-in emails were sent just now. Try again in a little while, or use a link you already got.';
  }
  return error.message;
}
