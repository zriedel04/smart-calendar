import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { createEmptyData, createSampleData } from '../state/defaults';
import { STORAGE_KEY } from '../state/storage';
import { StoreProvider } from '../state/StoreProvider';
import type { SyncBackend, SyncUser } from './backend';
import type { SyncState } from './engine';
import { memoryStore } from './memoryStore';
import { errorMessage, signInErrorMessage } from './errors';
import { SyncProvider } from './SyncProvider';

function fakeBackend(cloud: ReturnType<typeof memoryStore>, signedIn: SyncUser | null = null) {
  let user = signedIn;
  const userListeners = new Set<(u: SyncUser | null) => void>();
  const remoteListeners = new Set<(version: number) => void>();
  const sent: string[] = [];
  const backend: SyncBackend = {
    currentUser: async () => user,
    onUserChange: (cb) => {
      userListeners.add(cb);
      return () => userListeners.delete(cb);
    },
    signIn: async (email) => {
      sent.push(email);
      return null;
    },
    signOut: async () => {
      user = null;
      userListeners.forEach((cb) => cb(null));
    },
    store: () => cloud.store,
    onRemoteChange: (_id, cb) => {
      remoteListeners.add(cb);
      return () => remoteListeners.delete(cb);
    },
  };
  return {
    backend,
    sent,
    finishSignIn(u: SyncUser) {
      user = u;
      act(() => userListeners.forEach((cb) => cb(u)));
    },
    notifyRemote() {
      act(() => remoteListeners.forEach((cb) => cb(cloud.row?.version ?? 0)));
    },
  };
}

function memorySyncState() {
  const saved = new Map<string, SyncState>();
  return {
    load: (id: string) => saved.get(id) ?? null,
    save: (id: string, state: SyncState | null) => (state ? saved.set(id, state) : saved.delete(id)),
  };
}

function renderWithSync(backend: SyncBackend, syncState = memorySyncState()) {
  return render(
    <StoreProvider>
      <SyncProvider backend={backend} syncState={syncState}>
        <App />
      </SyncProvider>
    </StoreProvider>,
  );
}

const ME: SyncUser = { id: 'user-1', email: 'zach@example.com' };
const taskTitles = (data: { tasks: { title: string }[] } | undefined) => data?.tasks.map((t) => t.title) ?? [];

describe('Sync across devices', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 2, 9, 0));
    window.location.hash = '';
  });

  it('signs in by email link, uploads the calendar, saves changes and picks up other devices', async () => {
    const user = userEvent.setup();
    const cloud = memoryStore();
    const fake = fakeBackend(cloud);
    renderWithSync(fake.backend);

    await user.click(screen.getByRole('button', { name: 'Try it with sample tasks' }));
    await user.click(screen.getByRole('button', { name: 'Schedule' }));
    await user.type(screen.getByLabelText('Email'), 'zach@example.com');
    await user.click(screen.getByRole('button', { name: 'Email me a sign-in link' }));
    expect(fake.sent).toEqual(['zach@example.com']);
    expect(screen.getByText(/for a sign-in link/)).toBeInTheDocument();

    // Opening the link finishes signing in, and this device's calendar becomes the account's.
    fake.finishSignIn(ME);
    await waitFor(() => expect(screen.getByText(/^Synced/)).toBeInTheDocument());
    expect(screen.getByText('zach@example.com')).toBeInTheDocument();
    expect(taskTitles(cloud.row?.data)).toContain('Reply to internship recruiter');

    // A change here is saved to the account a moment later.
    await user.click(screen.getByRole('button', { name: 'Add task' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a task' });
    await user.type(within(dialog).getByLabelText('What do you need to do?'), 'Essay');
    await user.type(within(dialog).getByLabelText('Estimated hours'), '2');
    await user.click(within(dialog).getByRole('button', { name: 'Add task' }));
    await waitFor(() => expect(taskTitles(cloud.row?.data)).toContain('Essay'), { timeout: 4000 });

    // Another device adds a task; this one shows it.
    const elsewhere = structuredClone(cloud.row!.data);
    elsewhere.tasks.push({ ...elsewhere.tasks[0]!, id: 'from-laptop', title: 'Added on the laptop' });
    cloud.saveFromElsewhere(elsewhere);
    fake.notifyRemote();
    await user.click(screen.getByRole('button', { name: 'Tasks' }));
    await waitFor(() => expect(screen.getByText('Added on the laptop')).toBeInTheDocument());

    // Signing out keeps this device's calendar.
    await user.click(screen.getByRole('button', { name: 'Schedule' }));
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.getByRole('button', { name: 'Email me a sign-in link' })).toBeInTheDocument();
    expect(taskTitles(JSON.parse(localStorage.getItem(STORAGE_KEY)!))).toContain('Added on the laptop');
  });

  it("doesn't upload this tab's older calendar when another tab saved a newer checkpoint first", async () => {
    const user = userEvent.setup();
    const cloud = memoryStore();
    const fake = fakeBackend(cloud, ME);
    const shared = memorySyncState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(createSampleData('2026-11-02')));
    renderWithSync(fake.backend, shared);
    await waitFor(() => expect(cloud.row?.version).toBe(1));

    // Another tab syncs a task from the laptop and saves its checkpoint, but this tab hasn't
    // received that tab's calendar yet.
    const fromOtherTab = structuredClone(cloud.row!.data);
    fromOtherTab.tasks.push({ ...fromOtherTab.tasks[0]!, id: 'from-laptop', title: 'Added on the laptop' });
    cloud.saveFromElsewhere(fromOtherTab);
    shared.save(ME.id, { version: cloud.row!.version, base: fromOtherTab });

    await user.click(screen.getByRole('button', { name: 'Schedule' }));
    await user.click(screen.getByRole('button', { name: 'Sync now' }));
    await waitFor(() => expect(screen.getByText(/^Synced/)).toBeInTheDocument());
    expect(taskTitles(cloud.row?.data)).toContain('Added on the laptop');
    await user.click(screen.getByRole('button', { name: 'Tasks' }));
    expect(screen.getByText('Added on the laptop')).toBeInTheDocument();
  });

  it('keeps changes from another device when you edit while a sync is fetching them', async () => {
    const user = userEvent.setup();
    const cloud = memoryStore();
    const fake = fakeBackend(cloud, ME);
    // Lets the test hold the next fetch until it has made a change on this device.
    let gate: Promise<void> | null = null;
    let open = () => {};
    const backend: SyncBackend = {
      ...fake.backend,
      store: () => ({
        ...cloud.store,
        fetch: async () => {
          const wait = gate;
          gate = null;
          if (wait) await wait;
          return cloud.store.fetch();
        },
      }),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(createSampleData('2026-11-02')));
    renderWithSync(backend);
    await waitFor(() => expect(cloud.row?.version).toBe(1));

    const fromLaptop = structuredClone(cloud.row!.data);
    fromLaptop.tasks.push({ ...fromLaptop.tasks[0]!, id: 'from-laptop', title: 'Added on the laptop' });
    cloud.saveFromElsewhere(fromLaptop);
    gate = new Promise((resolve) => (open = resolve));
    fake.notifyRemote();

    // Add a task while that sync waits for the account.
    await user.click(screen.getByRole('button', { name: 'Add task' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a task' });
    await user.type(within(dialog).getByLabelText('What do you need to do?'), 'Essay');
    await user.type(within(dialog).getByLabelText('Estimated hours'), '2');
    await user.click(within(dialog).getByRole('button', { name: 'Add task' }));
    act(() => open());

    await waitFor(() => expect(taskTitles(cloud.row?.data)).toContain('Essay'));
    expect(taskTitles(cloud.row?.data)).toContain('Added on the laptop');
  });

  it('asks before replacing the account after another tab signed out', async () => {
    const user = userEvent.setup();
    const cloud = memoryStore();
    const fake = fakeBackend(cloud, ME);
    const shared = memorySyncState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(createSampleData('2026-11-02')));
    renderWithSync(fake.backend, shared);
    await waitFor(() => expect(cloud.row?.version).toBe(1));

    // Another tab signs out, which clears the saved checkpoint and signs this tab out too.
    shared.save(ME.id, null);
    await act(() => fake.backend.signOut());
    // Signed out, the calendar changes here.
    await user.click(screen.getByRole('button', { name: 'Add task' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a task' });
    await user.type(within(dialog).getByLabelText('What do you need to do?'), 'Essay');
    await user.type(within(dialog).getByLabelText('Estimated hours'), '2');
    await user.click(within(dialog).getByRole('button', { name: 'Add task' }));

    fake.finishSignIn(ME);
    await screen.findByRole('dialog', { name: 'Which calendar do you want to keep?' });
    expect(cloud.row!.version).toBe(1);
  });

  it("asks which calendar to keep when this device and the account both have one", async () => {
    const user = userEvent.setup();
    const account = { ...createEmptyData(), tasks: [{ id: 't1', title: 'From my account', dueDate: '2026-11-06', estimateMinutes: 60, createdAt: '2026-11-01T00:00:00.000Z' }] };
    const cloud = memoryStore({ data: account, version: 3 });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(createSampleData('2026-11-02')));
    renderWithSync(fakeBackend(cloud, ME).backend);

    const dialog = await screen.findByRole('dialog', { name: 'Which calendar do you want to keep?' });
    expect(within(dialog).getByText(/1 open task/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: "Use my account's" }));
    await waitFor(() => expect(screen.getByText('From my account')).toBeInTheDocument());
    expect(screen.queryByText('Reply to internship recruiter')).not.toBeInTheDocument();
    expect(cloud.row!.version).toBe(3);
  });

  it('closing the question keeps this device\'s calendar and waits for a choice', async () => {
    const user = userEvent.setup();
    const account = { ...createEmptyData(), tasks: [{ id: 't1', title: 'From my account', dueDate: '2026-11-06', estimateMinutes: 60, createdAt: '2026-11-01T00:00:00.000Z' }] };
    const cloud = memoryStore({ data: account, version: 3 });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(createSampleData('2026-11-02')));
    renderWithSync(fakeBackend(cloud, ME).backend);

    await screen.findByRole('dialog', { name: 'Which calendar do you want to keep?' });
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('From my account')).not.toBeInTheDocument();
    expect(taskTitles(JSON.parse(localStorage.getItem(STORAGE_KEY)!))).toContain('Reply to internship recruiter');
    expect(cloud.row!.version).toBe(3);

    // The account card offers the question again.
    await user.click(screen.getByRole('button', { name: 'Schedule' }));
    await user.click(screen.getByRole('button', { name: 'Choose calendar' }));
    expect(screen.getByRole('dialog', { name: 'Which calendar do you want to keep?' })).toBeInTheDocument();
  });

  it("can keep this device's calendar instead", async () => {
    const user = userEvent.setup();
    const cloud = memoryStore({ data: { ...createEmptyData(), weeklyHours: createEmptyData().weeklyHours.map(() => []) }, version: 1 });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(createSampleData('2026-11-02')));
    renderWithSync(fakeBackend(cloud, ME).backend);

    const dialog = await screen.findByRole('dialog', { name: 'Which calendar do you want to keep?' });
    await user.click(within(dialog).getByRole('button', { name: "Keep this device's" }));
    await waitFor(() => expect(cloud.row!.version).toBe(2));
    expect(taskTitles(cloud.row!.data)).toContain('Reply to internship recruiter');
  });
});

describe('errorMessage', () => {
  it("shows Supabase's own message for the plain error objects it returns", () => {
    expect(errorMessage({ message: 'permission denied for table calendar_data', code: '42501' })).toBe(
      'permission denied for table calendar_data (42501)',
    );
    expect(errorMessage(new Error('Failed to fetch'))).toBe('Failed to fetch');
    expect(errorMessage(undefined)).toBe("Couldn't reach your account.");
  });
});

describe('signInErrorMessage', () => {
  it('explains the email limit in plain words', () => {
    expect(signInErrorMessage({ message: 'email rate limit exceeded', code: 'over_email_send_rate_limit', status: 429 })).toMatch(/^Too many sign-in emails/);
    expect(signInErrorMessage({ message: 'Invalid email' })).toBe('Invalid email');
  });
});
