import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { createSampleData } from '../state/defaults';
import { STORAGE_KEY } from '../state/storage';
import { StoreProvider } from '../state/StoreProvider';
import type { AppData } from '../state/types';
import type { SyncBackend, SyncUser } from './backend';
import type { FeedStatus } from './feedContext';
import { FeedProvider } from './FeedProvider';
import { memoryStore } from './memoryStore';
import { SyncProvider } from './SyncProvider';

const ME: SyncUser = { id: 'user-1', email: 'zach@example.com' };
const LINK = 'https://school.instructure.com/feeds/calendars/user_abc.ics';

const calendar = (...events: string[]) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events.flatMap((e) => ['BEGIN:VEVENT', e, 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n');
const assignment = (uid: string, title: string, due: string) =>
  [`UID:event-assignment-${uid}`, `SUMMARY:${title}`, `DTSTART:${due}`, `DTEND:${due}`].join('\r\n');

function setup(signedIn: SyncUser | null, feed: () => Promise<string>, statusAt: Record<string, FeedStatus> = {}) {
  const fetchFeed = vi.fn(feed);
  const backend: SyncBackend = {
    currentUser: async () => signedIn,
    onUserChange: () => () => {},
    signIn: async () => null,
    signOut: async () => {},
    store: () => memoryStore().store,
    onRemoteChange: () => () => {},
    fetchFeed,
  };
  const syncState = { load: () => null, save: () => {} };
  let saved = statusAt;
  const statusStore = { load: () => saved, save: (s: Record<string, FeedStatus>) => (saved = s) };
  render(
    <StoreProvider>
      <SyncProvider backend={backend} syncState={syncState}>
        <FeedProvider statusStore={statusStore}>
          <App />
        </FeedProvider>
      </SyncProvider>
    </StoreProvider>,
  );
  return { fetchFeed };
}

const stored = (): AppData => JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppData;

describe('Calendar links', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 2, 9, 0));
    window.location.hash = '';
    localStorage.setItem(STORAGE_KEY, JSON.stringify(createSampleData('2026-11-02')));
  });

  it('adds a Canvas link and brings in its assignments with the chosen estimate', async () => {
    const user = userEvent.setup();
    const { fetchFeed } = setup(ME, async () => calendar(assignment('1', 'Essay 2 [ENG 102]', '20261107T065900Z')));
    await user.click(screen.getByRole('button', { name: 'Schedule' }));
    const card = (await screen.findByRole('heading', { name: 'Calendar links' })).closest('section')!;

    await user.type(within(card).getByLabelText('Calendar link'), LINK.replace('https://', 'webcal://'));
    await user.clear(within(card).getByLabelText('Hours per new assignment'));
    await user.type(within(card).getByLabelText('Hours per new assignment'), '2');
    await user.click(within(card).getByRole('button', { name: 'Add link' }));

    await waitFor(() => expect(within(card).getByText('Canvas')).toBeInTheDocument());
    expect(within(card).getByText('Updated just now')).toBeInTheDocument();
    expect(fetchFeed).toHaveBeenCalledWith(LINK);
    const essay = stored().tasks.find((t) => t.title === 'Essay 2 · ENG 102');
    expect(essay).toMatchObject({ dueDate: '2026-11-06', estimateMinutes: 120 });
  });

  it("hides a course's assignments right away and brings them back", async () => {
    const user = userEvent.setup();
    const { fetchFeed } = setup(ME, async () =>
      calendar(
        assignment('1', 'Sprint report [2026FallC-T-CSE485-60367]', '20261107T065900Z'),
        assignment('2', 'Section 5.4 [2026FallC-T-MAT343-71234]', '20261107T065900Z'),
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Schedule' }));
    const card = (await screen.findByRole('heading', { name: 'Calendar links' })).closest('section')!;
    await user.type(within(card).getByLabelText('Calendar link'), LINK);
    await user.click(within(card).getByRole('button', { name: 'Add link' }));
    const math = await within(card).findByRole('button', { name: 'MAT 343' });
    expect(math).toHaveAttribute('aria-pressed', 'true');

    await user.click(math);
    expect(within(card).getByRole('button', { name: 'MAT 343' })).toHaveAttribute('aria-pressed', 'false');
    expect(stored().tasks.some((t) => t.title === 'Section 5.4 · MAT 343')).toBe(false);
    expect(stored().tasks.some((t) => t.title === 'Sprint report · CSE 485')).toBe(true);
    await user.click(within(card).getByRole('button', { name: 'MAT 343' }));
    expect(stored().tasks.some((t) => t.title === 'Section 5.4 · MAT 343')).toBe(true);
    // The link's copy from adding it was used, without fetching again.
    expect(fetchFeed).toHaveBeenCalledTimes(1);
  });

  it("shows why a link couldn't be added", async () => {
    const user = userEvent.setup();
    setup(ME, async () => {
      throw new Error("That link isn't a calendar (.ics) feed.");
    });
    await user.click(screen.getByRole('button', { name: 'Schedule' }));
    const card = (await screen.findByRole('heading', { name: 'Calendar links' })).closest('section')!;
    await user.type(within(card).getByLabelText('Calendar link'), 'https://example.com/page');
    await user.click(within(card).getByRole('button', { name: 'Add link' }));
    expect(await within(card).findByText("That link isn't a calendar (.ics) feed.")).toBeInTheDocument();
    expect(stored().feeds).toBeUndefined();
  });

  it('refreshes links that are due when the app opens', async () => {
    const data = createSampleData('2026-11-02');
    data.feeds = [{ id: 'f1', url: LINK, name: 'Canvas', estimateMinutes: 60, addedAt: '2026-10-01T00:00:00.000Z' }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    const { fetchFeed } = setup(ME, async () => calendar(assignment('9', 'Quiz 4', '20261110T065900Z')), {
      f1: { at: Date.now() - 4 * 60 * 60 * 1000 },
    });
    await waitFor(() => expect(stored().tasks.some((t) => t.title === 'Quiz 4')).toBe(true));
    expect(fetchFeed).toHaveBeenCalledTimes(1);
  });

  it("doesn't refresh a link updated recently", async () => {
    const user = userEvent.setup();
    const data = createSampleData('2026-11-02');
    data.feeds = [{ id: 'f1', url: LINK, name: 'Canvas', estimateMinutes: 60, addedAt: '2026-10-01T00:00:00.000Z' }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    const { fetchFeed } = setup(ME, async () => calendar(), { f1: { at: Date.now() - 60_000 } });
    await user.click(screen.getByRole('button', { name: 'Schedule' }));
    expect(await screen.findByText('Updated 1m ago')).toBeInTheDocument();
    expect(fetchFeed).not.toHaveBeenCalled();
  });

  it('asks you to sign in to add a link', async () => {
    const user = userEvent.setup();
    setup(null, async () => calendar());
    await user.click(screen.getByRole('button', { name: 'Schedule' }));
    expect(await screen.findByText(/Sign in above to add calendar links/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Calendar link')).not.toBeInTheDocument();
  });
});
