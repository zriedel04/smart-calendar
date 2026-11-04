import { Cloud, CloudOff, LogOut, Mail, RefreshCw } from 'lucide-react';
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

/** Sign in with an emailed link to keep the same calendar on every device. Hidden when accounts aren't set up. */
export function AccountCard() {
  const sync = useSync();
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (!sync.available) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const address = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setProblem('Enter your email address.');
      return;
    }
    setSending(true);
    setProblem(null);
    const failure = await sync.signIn(address);
    setSending(false);
    if (failure) setProblem(failure);
    else setSentTo(address);
  }

  if (sync.status === 'signed-out') {
    return (
      <Card>
        <CardHeader
          title="Sync across devices"
          description="Sign in to keep the same calendar on your phone and laptop. Without an account, everything stays in this browser."
        />
        {sentTo ? (
          <p className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300" role="status">
            <Mail className="mt-0.5 size-4 shrink-0 text-indigo-500" aria-hidden />
            <span>
              Check <strong>{sentTo}</strong> for a sign-in link and open it on this device.{' '}
              <button type="button" onClick={() => setSentTo(null)} className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-300">
                Use a different email
              </button>
            </span>
          </p>
        ) : (
          <form onSubmit={submit} className="flex flex-wrap gap-2" noValidate>
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
            <Button type="submit" variant="primary" disabled={sending}>
              <Mail className="size-4" /> {sending ? 'Sending…' : 'Email me a sign-in link'}
            </Button>
          </form>
        )}
        {problem && <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{problem}</p>}
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
    </Card>
  );
}
