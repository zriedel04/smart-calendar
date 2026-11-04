import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { StoreProvider } from './state/StoreProvider';
import { createSampleData } from './state/defaults';
import { STORAGE_KEY } from './state/storage';

function renderApp() {
  return render(
    <StoreProvider>
      <App />
    </StoreProvider>,
  );
}

const todaysList = () => screen.getByRole('heading', { name: "Today's list" }).closest('section')!;

describe('App', () => {
  beforeEach(() => {
    // Monday, November 2, 2026. Default Monday hours are 12pm to 6pm.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 2, 9, 0));
    window.location.hash = '';
  });

  it('turns a task into a daily list, re-plans when hours change, and tracks progress', async () => {
    const user = userEvent.setup();
    renderApp();

    // Add a 10 hour task due next Monday.
    await user.click(screen.getByRole('button', { name: 'Add your first task' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a task' });
    await user.type(within(dialog).getByLabelText('What do you need to do?'), 'Write research essay');
    await user.type(within(dialog).getByLabelText('Estimated hours'), '10');
    await user.click(within(dialog).getByRole('button', { name: 'Add task' }));

    // Nothing else is due, so all 6 free hours today go to the essay.
    expect(within(todaysList()).getByText('Write research essay')).toBeInTheDocument();
    expect(within(todaysList()).getByText(/^6h · due Mon, Nov 9 · 10h left in total/)).toBeInTheDocument();

    // Only 12pm to 4pm today: the list shrinks to 4 hours.
    await user.click(screen.getByRole('button', { name: "Change today's hours" }));
    const hours = screen.getByRole('dialog');
    fireEvent.change(within(hours).getByLabelText('Hours block 1 end'), { target: { value: '16:00' } });
    await user.click(within(hours).getByRole('button', { name: 'Save' }));

    expect(screen.getByText('Changed for today')).toBeInTheDocument();
    expect(within(todaysList()).getByText(/^4h · due Mon, Nov 9/)).toBeInTheDocument();

    // Tick it off.
    await user.click(screen.getByRole('checkbox', { name: 'Mark "Write research essay" done' }));
    expect(screen.getByText('4h of 4h done')).toBeInTheDocument();
    expect(screen.getByText('All done for today. Nice work!')).toBeInTheDocument();

    // Next Monday keeps the usual 6 hours.
    await user.click(screen.getByRole('button', { name: 'Schedule' }));
    expect(screen.getByText('Monday, Nov 2')).toBeInTheDocument();
    expect(screen.getAllByText(/usually 12pm – 6pm/)).toHaveLength(1);
  });

  it('keeps keyboard focus inside an open dialog and makes the page behind it inert', async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await user.click(screen.getByRole('button', { name: 'Add your first task' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a task' });
    expect(container.closest('[inert]')).not.toBeNull();

    const addButton = within(dialog).getByRole('button', { name: 'Add task' });
    addButton.focus();
    await user.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(addButton);

    await user.keyboard('{Escape}');
    expect(container.closest('[inert]')).toBeNull();
  });

  it('picks up changes saved in another tab instead of overwriting them', async () => {
    const user = userEvent.setup();
    renderApp();
    expect(screen.getByText('No tasks yet')).toBeInTheDocument();

    // Another tab saves sample data.
    const newValue = JSON.stringify(createSampleData('2026-11-02'));
    localStorage.setItem(STORAGE_KEY, newValue);
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue }));
    });
    expect(within(todaysList()).getByText('Reply to internship recruiter')).toBeInTheDocument();

    // An edit here keeps the other tab's tasks.
    await user.click(screen.getByRole('button', { name: 'Schedule' }));
    fireEvent.change(screen.getByLabelText('Monday block 1 end'), { target: { value: '16:00' } });
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.tasks).toHaveLength(6);
    expect(saved.weeklyHours[1]).toEqual([{ start: 720, end: 960 }]);
  });

  it('adds several tasks at once', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Tasks' }));
    await user.click(screen.getByRole('button', { name: 'Add several' }));
    const dialog = screen.getByRole('dialog', { name: 'Add several tasks' });
    await user.type(within(dialog).getByLabelText('Task 1 name'), 'Read chapter 4');
    await user.type(within(dialog).getByLabelText('Task 1 hours'), '2');
    await user.type(within(dialog).getByLabelText('Task 2 name'), 'Lab worksheet');
    await user.type(within(dialog).getByLabelText('Task 2 hours'), '1.5');
    await user.click(within(dialog).getByRole('button', { name: 'Add 2 tasks' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Read chapter 4')).toBeInTheDocument();
    expect(screen.getByText('Lab worksheet')).toBeInTheDocument();
    expect(screen.getByText(/2 open/)).toBeInTheDocument();
  });

  it('rejects a bulk row whose hours are too large to be a real number', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Tasks' }));
    await user.click(screen.getByRole('button', { name: 'Add several' }));
    const dialog = screen.getByRole('dialog', { name: 'Add several tasks' });
    await user.type(within(dialog).getByLabelText('Task 1 name'), 'Huge task');
    fireEvent.change(within(dialog).getByLabelText('Task 1 hours'), { target: { value: '1e308' } });
    await user.click(within(dialog).getByRole('button', { name: 'Add task' }));

    expect(screen.getByRole('dialog', { name: 'Add several tasks' })).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY) ?? '').not.toContain('Huge task');
  });

  it('shows work on a month calendar and crosses it off when done', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Try it with sample tasks' }));
    await user.click(screen.getByRole('button', { name: 'Month' }));

    expect(screen.getByRole('heading', { name: 'November 2026' })).toBeInTheDocument();
    // A timed event shows its time under its title in the day's cell.
    expect(screen.getByRole('button', { name: 'Monday, November 2' })).toHaveTextContent(/Team standup\s*1pm – 1:30pm/);
    // Today (Monday, Nov 2) is selected: its planned work is listed below the grid.
    const checkbox = screen.getByRole('checkbox', { name: 'Check off "Reply to internship recruiter"' });
    await user.click(checkbox);
    const title = screen.getAllByText('Reply to internship recruiter').find((el) => el.tagName === 'P')!;
    expect(title).toHaveClass('line-through');

    // Logging all of its time finished the task, so its due-date entry has no "not finished" toggle that wouldn't work.
    expect(screen.queryByRole('checkbox', { name: /Mark "Reply to internship recruiter"/ })).not.toBeInTheDocument();
    expect(screen.getByText('Finished')).toBeInTheDocument();
  });

  it('adds a birthday from the month calendar without taking work time', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Month' }));
    await user.click(screen.getByRole('button', { name: 'Thursday, November 12' }));
    await user.click(screen.getByRole('button', { name: 'Event' }));
    const dialog = screen.getByRole('dialog', { name: 'Add to your calendar' });
    await user.click(within(dialog).getByRole('radio', { name: 'Birthday' }));
    await user.type(within(dialog).getByLabelText('Name'), "Mom's birthday");
    await user.click(within(dialog).getByRole('button', { name: 'Add event' }));

    expect(screen.getByRole('button', { name: /^Mom's birthday/ })).toHaveTextContent('All day');
    const [saved] = JSON.parse(localStorage.getItem(STORAGE_KEY)!).events;
    expect(saved).toMatchObject({ date: '2026-11-12', kind: 'birthday', allDay: true, repeat: 'yearly', blocksWork: false });
  });

  it('imports Canvas assignments as tasks and other entries as events, once', async () => {
    const user = userEvent.setup();
    renderApp();
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT\r\nUID:event-assignment-1\r\nSUMMARY:Lab 5 report\r\nDTSTART:20261106T065900Z\r\nDTEND:20261106T065900Z\r\nEND:VEVENT',
      'BEGIN:VEVENT\r\nUID:event-assignment-0\r\nSUMMARY:Old quiz\r\nDTSTART:20261001T065900Z\r\nDTEND:20261001T065900Z\r\nEND:VEVENT',
      'BEGIN:VEVENT\r\nUID:class-1\r\nSUMMARY:Physics lecture\r\nDTSTART:20261103T130000\r\nDTEND:20261103T140000\r\nRRULE:FREQ=WEEKLY\r\nEND:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const file = () => new File([ics], 'canvas.ics', { type: 'text/calendar' });

    await user.click(screen.getByRole('button', { name: 'Tasks' }));
    await user.click(screen.getByRole('button', { name: 'Import' }));
    let dialog = screen.getByRole('dialog', { name: 'Import a calendar' });
    await user.upload(within(dialog).getByLabelText('Calendar file'), file());

    // The past quiz is skipped and hidden; the assignment needs hours before importing.
    expect(await within(dialog).findByText('Lab 5 report')).toBeInTheDocument();
    expect(within(dialog).queryByText('Old quiz')).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText('Import "Physics lecture" as')).toHaveValue('event');
    await user.click(within(dialog).getByRole('button', { name: 'Import 1 task and 1 event' }));
    expect(within(dialog).getByText(/Add hours for the highlighted task/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Hours for "Lab 5 report"'), '3');
    await user.click(within(dialog).getByRole('button', { name: 'Import 1 task and 1 event' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Lab 5 report')).toBeInTheDocument();
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.tasks[0]).toMatchObject({ dueDate: '2026-11-05', estimateMinutes: 180 });
    expect(saved.events[0]).toMatchObject({ title: 'Physics lecture', repeat: 'weekly', start: 780, end: 840 });

    // Importing the same file again adds nothing.
    await user.click(screen.getByRole('button', { name: 'Import' }));
    dialog = screen.getByRole('dialog', { name: 'Import a calendar' });
    await user.upload(within(dialog).getByLabelText('Calendar file'), file());
    expect(await within(dialog).findByText(/already in your calendar or already over/)).toBeInTheDocument();

    // Picking a file with nothing in it clears the preview and says why.
    await user.click(within(dialog).getByRole('button', { name: /Choose a different file/ }));
    await user.upload(within(dialog).getByLabelText('Calendar file'), new File(['not a calendar'], 'x.ics'));
    expect(await within(dialog).findByText(/doesn't have any calendar entries/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /^Import|Nothing to import/ })).not.toBeInTheDocument();
  });

  it('keeps the last date of a yearly event when it is edited', async () => {
    const data = createSampleData('2026-11-02');
    data.events = [
      { id: 'fair', title: 'County fair', date: '2026-10-01', start: 0, end: 1440, repeat: 'yearly', allDay: true, kind: 'other', until: '2028-10-01' },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Schedule' }));
    await user.click(screen.getByRole('button', { name: /County fair/ }));
    const dialog = screen.getByRole('dialog', { name: 'Edit event' });
    expect(within(dialog).getByLabelText('Last date (optional)')).toHaveValue('2028-10-01');
    await user.type(within(dialog).getByLabelText('Name'), ' 2026');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    const [saved] = JSON.parse(localStorage.getItem(STORAGE_KEY)!).events;
    expect(saved).toMatchObject({ title: 'County fair 2026', until: '2028-10-01' });
  });

  it('offers adding a task or an event at the top of every page', async () => {
    const user = userEvent.setup();
    renderApp();
    for (const tab of ['Today', 'Week', 'Month', 'Tasks', 'Schedule']) {
      await user.click(screen.getByRole('button', { name: tab }));
      expect(screen.getByRole('button', { name: 'Add task' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add event' })).toBeInTheDocument();
    }
    await user.click(screen.getByRole('button', { name: 'Add event' }));
    expect(screen.getByRole('dialog', { name: 'Add to your calendar' })).toBeInTheDocument();
  });

  it('remembers data after a reload', async () => {
    const user = userEvent.setup();
    const { unmount } = renderApp();
    await user.click(screen.getByRole('button', { name: 'Try it with sample tasks' }));
    expect(within(todaysList()).getByText('Reply to internship recruiter')).toBeInTheDocument();

    unmount();
    renderApp();
    expect(within(todaysList()).getByText('Reply to internship recruiter')).toBeInTheDocument();
  });

  it('shows priorities by due date on the Tasks screen', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Try it with sample tasks' }));
    await user.click(screen.getByRole('button', { name: 'Tasks' }));

    expect(screen.getByText('Due today')).toBeInTheDocument();
    expect(screen.getByText('Due within a week')).toBeInTheDocument();
    expect(screen.getByText('Due later')).toBeInTheDocument();
  });
});
