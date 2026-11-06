import { Cloud, CloudOff, LogIn, LogOut, Mail, RefreshCw, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useSync } from '../sync/context';
import { cx } from './cx';
import { inputClass } from './styles';
import { Button, Card, CardHeader } from './ui';

function syncedAgo(at: number | null): string {
  if (at === null) return '';
  const minutes = Math.floor((Date.now() - at) / 60_000);
  return minutes < 1 ? 'just now' : minutes < 60 ? `${minutes}m ago` : 'over an hour ago';
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 6;

/**
 * Sign in to keep the same calendar on every device. Hidden when accounts aren't set up. A password
 * works everywhere, including an app added to a phone's home screen, which emailed links can't reach.
 */
export function AccountCard() {
  const sync = useSync();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [settingPassword, setSettingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  if (!sync.available) return null;

  /** Runs a sign-in step with the email checked, showing what went wrong. */
  async function run(step: (address: string) => Promise<string | null>, needsPassword: boolean) {
    const address = email.trim();
    if (!EMAIL.test(address)) return setProblem('Enter your email address.');
    if (needsPassword && !password) return setProblem('Enter your password.');
    setBusy(true);
    setProblem(null);
    setNotice(null);
    const failure = await step(address);
    setBusy(false);
    if (failure) setProblem(failure);
  }

  const signIn = (e: FormEvent) => {
    e.preventDefault();
    void run(async (address) => {
      const failure = await sync.signInWithPassword(address, password);
      // Signing out later shows the form again: keep the email, but not the password.
      if (!failure) setPassword('');
      return failure;
    }, true);
  };

  const createAccount = () =>
    void run(async (address) => {
      if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters for your password.`;
      const result = await sync.signUp(address, password);
      if (result === 'confirm') {
        setNotice(`Check ${address} to confirm your account (the link works in any browser), then sign in here with your password.`);
        return null;
      }
      // Signed in straight away (Confirm email is off): don't leave the password in the form.
      if (result === null) setPassword('');
      return result;
    }, true);

  const emailLink = () =>
    void run(async (address) => {
      const failure = await sync.signIn(address);
      if (!failure) {
        setNotice(
          `Check ${address}. Open the sign-in link in this browser to sign in, then set a password in this card so other devices can sign in with it.`,
        );
      }
      return failure;
    }, false);

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    if (newPassword.length < MIN_PASSWORD) return setProblem(`Use at least ${MIN_PASSWORD} characters for your password.`);
    setBusy(true);
    setProblem(null);
    const failure = await sync.setPassword(newPassword);
    setBusy(false);
    if (failure) return setProblem(failure);
    setSettingPassword(false);
    setNewPassword('');
    setNotice('Password saved. Use it to sign in on your other devices, including the app on your home screen.');
  }

  const messages = (
    <>
      {notice && (
        <p className="mt-3 flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300" role="status">
          <Mail className="mt-0.5 size-4 shrink-0 text-indigo-500" aria-hidden />
          <span>{notice}</span>
        </p>
      )}
      {problem && <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{problem}</p>}
    </>
  );

  if (sync.status === 'signed-out') {
    return (
      <Card>
        <CardHeader
          title="Sync across devices"
          description="Sign in to keep the same calendar on your phone and laptop. Without an account, everything stays in this browser."
        />
        <form onSubmit={signIn} className="space-y-2" noValidate>
          <div className="flex flex-wrap gap-2">
            <label htmlFor="account-email" className="sr-only">
              Email
            </label>
            <input
              id="account-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={cx(inputClass, 'min-w-0 flex-1 basis-56')}
            />
            <label htmlFor="account-password" className="sr-only">
              Password
            </label>
            <input
              id="account-password"
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={cx(inputClass, 'min-w-0 flex-1 basis-40')}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" variant="primary" disabled={busy}>
              <LogIn className="size-4" /> Sign in
            </Button>
            <Button onClick={createAccount} disabled={busy}>
              <UserPlus className="size-4" /> Create account
            </Button>
          </div>
        </form>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Forgot your password, or never made one?{' '}
          <button
            type="button"
            onClick={emailLink}
            disabled={busy}
            className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-300"
          >
            Email me a sign-in link
          </button>
        </p>
        {messages}
      </Card>
    );
  }

  const trouble = sync.status === 'offline' || sync.status === 'error' || sync.conflict !== null;
  const statusText = sync.conflict
    ? 'Your account has a different calendar. Choose which one to keep to start syncing.'
    : sync.status === 'syncing'
      ? 'Syncing…'
      : sync.status === 'offline'
        ? 'Offline. Changes will sync when you\'re back online.'
        : sync.status === 'error'
          ? `Couldn't sync: ${sync.error ?? 'something went wrong'}`
          : `Synced ${syncedAgo(sync.lastSynced)}`;

  return (
    <Card>
      <CardHeader title="Sync across devices" description={<>Signed in as <strong>{sync.email ?? 'your account'}</strong>.</>} />
      <div className="flex flex-wrap items-center gap-3">
        <p className={cx('flex min-w-0 flex-1 items-center gap-2 text-sm', trouble ? 'text-amber-700 dark:text-amber-300' : 'text-slate-600 dark:text-slate-300')} role="status">
          {trouble ? <CloudOff className="size-4 shrink-0" aria-hidden /> : <Cloud className="size-4 shrink-0 text-emerald-500" aria-hidden />}
          <span>{statusText}</span>
        </p>
        {sync.conflict ? (
          <Button size="sm" variant="primary" onClick={sync.reopenConflict}>
            Choose calendar
          </Button>
        ) : (
          <Button size="sm" onClick={sync.syncNow} disabled={sync.status === 'syncing'}>
            <RefreshCw className="size-4" /> Sync now
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => void sync.signOut()}>
          <LogOut className="size-4" /> Sign out
        </Button>
      </div>
      {settingPassword ? (
        <form onSubmit={savePassword} className="mt-3 flex flex-wrap gap-2" noValidate>
          <label htmlFor="account-new-password" className="sr-only">
            New password
          </label>
          <input
            id="account-new-password"
            type="password"
            autoComplete="new-password"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={cx(inputClass, 'min-w-0 flex-1 basis-48')}
          />
          <Button type="submit" variant="primary" disabled={busy}>
            Save password
          </Button>
          <Button variant="ghost" onClick={() => setSettingPassword(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Sign in on other devices with your email and a password.{' '}
          <button
            type="button"
            onClick={() => {
              setSettingPassword(true);
              setNotice(null);
              setProblem(null);
            }}
            className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-300"
          >
            Set a password
          </button>
        </p>
      )}
      {messages}
    </Card>
  );
}
