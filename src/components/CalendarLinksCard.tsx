import { Link2, RefreshCw, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useStore } from '../state/context';
import { useSync } from '../sync/context';
import { useFeeds, type FeedStatus } from '../sync/feedContext';
import { cx } from './cx';
import { inputClass } from './styles';
import { Button, Card, CardHeader } from './ui';

function statusText(status: FeedStatus | undefined, refreshing: boolean): { text: string; problem: boolean } {
  if (refreshing) return { text: 'Updating…', problem: false };
  if (!status) return { text: 'Not updated on this device yet', problem: false };
  if (status.error) return { text: `Couldn't update: ${status.error}`, problem: true };
  const minutes = Math.floor((Date.now() - status.at) / 60_000);
  const ago = minutes < 1 ? 'just now' : minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`;
  return { text: `Updated ${ago}`, problem: false };
}

/** Calendar links from Canvas, Google Calendar or Outlook that keep themselves up to date. */
export function CalendarLinksCard() {
  const { data, dispatch } = useStore();
  const sync = useSync();
  const feeds = useFeeds();
  const [url, setUrl] = useState('');
  const [hours, setHours] = useState('1');
  const [adding, setAdding] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (!sync.available) return null;
  const links = data.feeds ?? [];

  async function submit(e: FormEvent) {
    e.preventDefault();
    const minutes = Math.round(Number(hours) * 60);
    if (!url.trim()) return setProblem('Paste a calendar link.');
    if (!Number.isFinite(minutes) || minutes < 5) return setProblem('Enter how many hours a new assignment usually takes.');
    setAdding(true);
    setProblem(null);
    const failure = await feeds.add(url, minutes);
    setAdding(false);
    if (failure) setProblem(failure);
    else setUrl('');
  }

  return (
    <Card>
      <CardHeader
        title="Calendar links"
        description="Add your Canvas, Google Calendar or Outlook link once. New assignments, changed due dates and cancelled events update by themselves."
      />
      {links.length > 0 && (
        <ul className="mb-4 divide-y divide-slate-100 dark:divide-slate-800">
          {links.map((feed) => {
            const { text, problem: failed } = statusText(feeds.status[feed.id], feeds.refreshing.has(feed.id));
            return (
              <li key={feed.id} className="py-2.5">
                <div className="flex items-center gap-3">
                  <Link2 className="size-4 shrink-0 text-indigo-500" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{feed.name}</p>
                    <p
                      className={cx(
                        'truncate text-xs',
                        failed ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400',
                      )}
                    >
                      {text}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => feeds.refresh(feed.id)}
                    disabled={!feeds.available || feeds.refreshing.has(feed.id)}
                    aria-label={`Update ${feed.name} now`}
                  >
                    <RefreshCw className="size-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => dispatch({ type: 'feed/remove', id: feed.id })}
                    aria-label={`Remove ${feed.name}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                {feed.courses && feed.courses.length > 1 && (
                  <div className="mt-2 pl-7">
                    <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">Courses to include</p>
                    <div className="flex flex-wrap gap-1.5">
                      {feed.courses.map((course) => {
                        const shown = !feed.hiddenCourses?.includes(course);
                        return (
                          <button
                            key={course}
                            type="button"
                            aria-pressed={shown}
                            onClick={() => feeds.setCourseHidden(feed.id, course, shown)}
                            className={cx(
                              'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
                              shown
                                ? 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/15 dark:text-indigo-200'
                                : 'border-slate-200 text-slate-400 line-through dark:border-slate-700 dark:text-slate-500',
                            )}
                          >
                            {course}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {feeds.available ? (
        <form onSubmit={submit} className="space-y-3" noValidate>
          <div>
            <label htmlFor="feed-url" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Calendar link
            </label>
            <input
              id="feed-url"
              type="url"
              inputMode="url"
              placeholder="https://… or webcal://…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className={cx(inputClass, 'w-full')}
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              In Canvas, open Calendar and click Calendar Feed. In Google Calendar, use the secret address in iCal format.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="feed-hours" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
                Hours per new assignment
              </label>
              <input
                id="feed-hours"
                type="number"
                min="0.25"
                step="0.25"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className={cx(inputClass, 'w-28')}
              />
            </div>
            <Button type="submit" variant="primary" disabled={adding}>
              <Link2 className="size-4" /> {adding ? 'Adding…' : 'Add link'}
            </Button>
          </div>
          {problem && <p className="text-sm text-rose-600 dark:text-rose-400">{problem}</p>}
        </form>
      ) : (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Sign in above to add calendar links. They update on every device you sign in on.
        </p>
      )}
    </Card>
  );
}
