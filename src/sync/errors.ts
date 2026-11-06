/** Supabase reports errors as plain objects with a message, not as Error instances, so read either. */
export function errorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string' && e.message) {
    const code = 'code' in e && typeof e.code === 'string' && e.code ? ` (${e.code})` : '';
    return e.message + code;
  }
  return "Couldn't reach your account.";
}

export const ALREADY_SIGNED_UP =
  'That email already has an account. Sign in instead. If you only ever used email links, sign in with a link once and set a password in this card.';

/** What to show when signing in, signing up or saving a password didn't work. */
export function passwordErrorMessage(error: { message: string; code?: string; status?: number }): string {
  if (error.code === 'invalid_credentials' || /invalid login credentials/i.test(error.message)) {
    return "Wrong email or password. If you've only used email links so far, use one to sign in and set a password here.";
  }
  if (error.code === 'email_not_confirmed') return 'Confirm your email first: open the link we sent, then sign in here.';
  if (error.code === 'user_already_exists') return ALREADY_SIGNED_UP;
  if (error.code === 'weak_password') return error.message || 'Pick a longer password.';
  if (error.code === 'same_password') return "That's already your password.";
  return signInErrorMessage(error);
}

/** What to show when a sign-in email couldn't be sent. */
export function signInErrorMessage(error: { message: string; code?: string; status?: number }): string {
  if (error.code === 'over_email_send_rate_limit' || error.status === 429) {
    return 'Too many sign-in emails were sent just now. Try again in a little while, or use a link you already got.';
  }
  return error.message;
}
