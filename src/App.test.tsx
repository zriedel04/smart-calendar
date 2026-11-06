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

  it('logs part of an item and pushes an item to tomorrow', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Add your first task' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a task' });
    await user.type(within(dialog).getByLabelText('What do you need to do?'), 'Write research essay');
    await user.type(within(dialog).getByLabelText('Estimated hours'), '10');
    await user.click(within(dialog).getByRole('button', { name: 'Add task' }));

    // Did 1.5 of the 6 planned hours: it shows as done, and the rest stays on the list.
    await user.click(screen.getByRole('button', { name: 'More for "Write research essay"' }));
    await user.type(screen.getByLabelText('Hours done on "Write research essay"'), '1.5');
    await user.click(within(todaysList()).getByRole('button', { name: 'Log' }));
    expect(screen.getByText('1h 30m of 6h done')).toBeInTheDocument();
    expect(within(todaysList()).getByText(/^4h 30m · due Mon, Nov 9/)).toBeInTheDocument();
    expect(within(todaysList()).getByText('1h 30m done')).toBeInTheDocument();

    // Push the rest to tomorrow, then bring it back.
    await user.click(screen.getByRole('button', { name: 'More for "Write research essay"' }));
    await user.click(screen.getByRole('button', { name: 'Push to tomorrow' }));
    expect(screen.getByText('Pushed to tomorrow')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Mark "Write research essay" done' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Bring "Write research essay" back to today' }));
    expect(screen.getByRole('checkbox', { name: 'Mark "Write research essay" done' })).toBeInTheDocument();
    expect(screen.queryByText('Pushed to tomorrow')).not.toBeInTheDocument();
  });

  it('adds a repeating task that lands on each matching day', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Add task' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a task' });
    await user.type(within(dialog).getByLabelText('What do you need to do?'), 'Study Spanish');
    await user.selectOptions(within(dialog).getByLabelText('Repeats'), 'Every weekday');
    expect(within(dialog).getByLabelText('First day')).toHaveValue('2026-11-02');
    await user.type(within(dialog).getByLabelText('Hours each day'), '1');
    await user.click(within(dialog).getByRole('button', { name: 'Add task' }));

    // Today's copy is on the list, and skipping it doesn't push it to tomorrow.
    expect(within(todaysList()).getByText('Study Spanish')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'More for "Study Spanish"' }));
    await user.click(screen.getByRole('button', { name: 'Skip today' }));
    expect(within(todaysList()).queryByText('Study Spanish')).not.toBeInTheDocument();
    expect(screen.queryByText('Pushed to tomorrow')).not.toBeInTheDocument();

    // The Tasks tab shows it once, with the next day it lands on.
    await user.click(screen.getByRole('button', { name: 'Tasks' }));
    expect(screen.getAllByText('Study Spanish')).toHaveLength(1);
    expect(screen.getByText(/Every weekday/)).toBeInTheDocument();
    expect(screen.getByText(/Next tomorrow/)).toBeInTheDocument();

    // Stopping it removes the upcoming days.
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(screen.getByText('Study Spanish'));
    await user.click(within(screen.getByRole('dialog', { name: 'Edit repeating task' })).getByRole('button', { name: 'Stop repeating' }));
    expect(screen.queryByText('Study Spanish')).not.toBeInTheDocument();
  });

  it('keeps logged time when a task becomes repeating, and lists a repeating task with nothing to do yet', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Add your first task' }));
    let dialog = screen.getByRole('dialog', { name: 'Add a task' });
    await user.type(within(dialog).getByLabelText('What do you need to do?'), 'Piano practice');
    await user.type(within(dialog).getByLabelText('Estimated hours'), '1');
    await user.click(within(dialog).getByRole('button', { name: 'Add task' }));
    await user.click(screen.getByRole('checkbox', { name: 'Mark "Piano practice" done' }));
    expect(screen.getByText('1h of 1h done')).toBeInTheDocument();

    // Make it repeat on Saturdays, starting next month: today's logged hour stays.
    await user.click(within(todaysList()).getByText('Piano practice'));
    dialog = screen.getByRole('dialog', { name: 'Edit task' });
    fireEvent.change(within(dialog).getByLabelText('Due date'), { target: { value: '2026-12-05' } });
    await user.selectOptions(within(dialog).getByLabelText('Repeats'), 'Every Saturday');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(screen.getByText('1h of 1h done')).toBeInTheDocument();

    // It has no copies yet, but the Tasks tab still shows it and can stop it.
    await user.click(screen.getByRole('button', { name: 'Tasks' }));
    expect(screen.getByText(/Every Saturday · Next Sat, Dec 5/)).toBeInTheDocument();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: /Piano practice.*Every Saturday/ }));
    await user.click(within(screen.getByRole('dialog', { name: 'Edit repeating task' })).getByRole('button', { name: 'Stop repeating' }));
    expect(screen.queryByText(/Every Saturday/)).not.toBeInTheDocument();
  });

  it('sets usual hours from a first-run choice, and undoes a tick', async () => {
    const user = userEvent.setup();
    renderApp();
    const evenings = screen.getByRole('radio', { name: 'Every evening, 6pm to 10pm' });
    await user.click(evenings);
    expect(evenings).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/6pm – 10pm/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add your first task' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a task' });
    await user.type(within(dialog).getByLabelText('What do you need to do?'), 'Essay');
    await user.type(within(dialog).getByLabelText('Estimated hours'), '2');
    await user.click(within(dialog).getByRole('button', { name: 'Add task' }));

    await user.click(screen.getByRole('checkbox', { name: 'Mark "Essay" done' }));
    expect(screen.getByText('Logged 2h on "Essay"')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('checkbox', { name: 'Mark "Essay" done' })).toBeInTheDocument();
    expect(screen.queryByText('Logged 2h on "Essay"')).not.toBeInTheDocument();
  });

  it('suggests when to work on each item, around events, and can turn the times off', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Add your first task' }));
    let dialog = screen.getByRole('dialog', { name: 'Add a task' });
    await user.type(within(dialog).getByLabelText('What do you need to do?'), 'Essay');
    await user.type(within(dialog).getByLabelText('Estimated hours'), '2');
    fireEvent.change(within(dialog).getByLabelText('Due date'), { target: { value: '2026-11-03' } });
    await user.click(within(dialog).getByRole('button', { name: 'Add task' }));
    await user.click(screen.getByRole('button', { name: 'Add task' }));
    dialog = screen.getByRole('dialog', { name: 'Add a task' });
    await user.type(within(dialog).getByLabelText('What do you need to do?'), 'Lab');
    await user.type(within(dialog).getByLabelText('Estimated hours'), '1');
    await user.click(within(dialog).getByRole('button', { name: 'Add task' }));

    // Hours are 12pm to 6pm; a 1pm to 1:30pm class splits the essay.
    await user.click(screen.getByRole('button', { name: 'Add event' }));
    dialog = screen.getByRole('dialog', { name: 'Add to your calendar' });
    await user.type(within(dialog).getByLabelText('Name'), 'Class');
    await user.selectOptions(within(dialog).getByLabelText('Repeats'), "Doesn't repeat");
    fireEvent.change(within(dialog).getByLabelText('Starts'), { target: { value: '13:00' } });
    fireEvent.change(within(dialog).getByLabelText('Ends'), { target: { value: '13:30' } });
    await user.click(within(dialog).getByRole('button', { name: 'Add event' }));

    expect(within(todaysList()).getByText('12pm – 2:30pm ·')).toHaveAttribute('title', 'Split around a break: 12pm – 1pm, 1:30pm – 2:30pm');
    expect(within(todaysList()).getByText('2:30pm – 3:30pm ·')).toBeInTheDocument();

    await user.click(screen.getByRole('switch', { name: /Suggested times/ }));
    expect(within(todaysList()).queryByText('2:30pm – 3:30pm ·')).not.toBeInTheDocument();
  });

  it('plans a task on the day you choose, from the form or by dragging it in the week', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Add your first task' }));
    let dialog = screen.getByRole('dialog', { name: 'Add a task' });
    await user.type(within(dialog).getByLabelText('What do you need to do?'), 'Essay');
    await user.type(within(dialog).getByLabelText('Estimated hours'), '2');
    fireEvent.change(within(dialog).getByLabelText('Due date'), { target: { value: '2026-11-06' } });
    fireEvent.change(within(dialog).getByLabelText('Work on it on (optional)'), { target: { value: '2026-11-07' } });
    await user.click(within(dialog).getByRole('button', { name: 'Add task' }));
    expect(within(dialog).getByText('Pick a day by the due date.')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Work on it on (optional)'), { target: { value: '2026-11-03' } });
    await user.click(within(dialog).getByRole('button', { name: 'Add task' }));
    expect(within(todaysList()).queryByText('Essay')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Week' }));
    const day = (n: number) => screen.getByText(String(n), { selector: 'p' }).closest('li')!;
    expect(within(day(3)).getByText('Essay')).toBeInTheDocument();
    expect(within(day(3)).getByLabelText('You chose this day')).toBeInTheDocument();

    // Drag it to Thursday.
    const dataTransfer = { setData: () => {}, effectAllowed: '', dropEffect: '' };
    fireEvent.dragStart(within(day(3)).getByText('Essay').closest('li')!, { dataTransfer });
    fireEvent.dragOver(day(5), { dataTransfer });
    fireEvent.drop(day(5), { dataTransfer });
    expect(within(day(3)).queryByText('Essay')).not.toBeInTheDocument();
    expect(within(day(5)).getByText('Essay')).toBeInTheDocument();
    expect(screen.getByText('Moved "Essay" to Thu, Nov 5')).toBeInTheDocument();

    // Days past the due date don't take it.
    fireEvent.dragStart(within(day(5)).getByText('Essay').closest('li')!, { dataTransfer });
    fireEvent.drop(day(7), { dataTransfer });
    expect(within(day(5)).getByText('Essay')).toBeInTheDocument();

    // Clearing the day in the form puts it back in due-date order, which starts today.
    await user.click(within(day(5)).getByText('Essay'));
    dialog = screen.getByRole('dialog', { name: 'Edit task' });
    fireEvent.change(within(dialog).getByLabelText('Work on it on (optional)'), { target: { value: '' } });
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(day(2)).getByText('Essay')).toBeInTheDocument();
  });

  it('times work on a task from any screen and logs it when stopped', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Add your first task' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a task' });
    await user.type(within(dialog).getByLabelText('What do you need to do?'), 'Essay');
    await user.type(within(dialog).getByLabelText('Estimated hours'), '2');
    await user.click(within(dialog).getByRole('button', { name: 'Add task' }));

    await user.click(screen.getByRole('button', { name: 'More for "Essay"' }));
    await user.click(screen.getByRole('button', { name: 'Start timer' }));
    expect(screen.getByRole('timer', { name: 'Timer for "Essay"' })).toBeInTheDocument();
    expect(within(todaysList()).getByLabelText('Timer running')).toBeInTheDocument();

    // It keeps running on other screens.
    vi.setSystemTime(new Date(2026, 10, 2, 9, 45, 30));
    await user.click(screen.getByRole('button', { name: 'Week' }));
    expect(screen.getByRole('timer', { name: 'Timer for "Essay"' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Stop and log' }));
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    expect(screen.getByText('Logged 45m on "Essay"')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Today' }));
    expect(within(todaysList()).getByText(/1h 15m · due/)).toBeInTheDocument();
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
    expect(screen.getByText("Let's set up your calendar")).toBeInTheDocument();

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
    expect(saved.tasks.filter((t: { seriesId?: string }) => !t.seriesId)).toHaveLength(6);
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

  it('shows only due dates on the month calendar when asked, and remembers it', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Try it with sample tasks' }));
    await user.click(screen.getByRole('button', { name: 'Month' }));
    expect(screen.getByRole('checkbox', { name: 'Check off "Reply to internship recruiter"' })).toBeInTheDocument();

    await user.click(screen.getByRole('switch', { name: /Due dates only/ }));
    expect(screen.getByRole('switch', { name: /Due dates only/ })).toHaveAttribute('aria-checked', 'true');
    // Planned work is gone; events still show.
    expect(screen.queryByRole('checkbox', { name: /^Check off/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Monday, November 2' })).toHaveTextContent('Team standup');
    expect(localStorage.getItem('smart-calendar:month-due-only')).toBe('on');
  });

  it('shows US holidays on the calendar, and hides them when switched off', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'Month' }));
    await user.click(screen.getByRole('button', { name: 'Thursday, November 26, Thanksgiving' }));
    expect(screen.getByText('Federal holiday')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Schedule' }));
    expect(screen.getByText(/Coming up: Veterans Day \(Nov 11\), Thanksgiving \(Nov 26\)/)).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Show US holidays' }));
    expect(window.localStorage.getItem('smart-calendar:show-holidays')).toBe('off');

    await user.click(screen.getByRole('button', { name: 'Month' }));
    expect(screen.getByRole('button', { name: 'Thursday, November 26' })).toBeInTheDocument();
    expect(screen.queryByText('Thanksgiving')).not.toBeInTheDocument();

    // Back on, for the other tests.
    await user.click(screen.getByRole('button', { name: 'Schedule' }));
    await user.click(screen.getByRole('switch', { name: 'Show US holidays' }));
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

  it('deletes picked tasks from a day in delete mode, and can undo it', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Try it with sample tasks' }));
    await user.click(screen.getByRole('button', { name: 'Month' }));
    await user.click(screen.getByRole('button', { name: 'Wednesday, November 4' }));
    await user.click(screen.getByRole('button', { name: 'Delete mode' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select "Algorithms problem set 6"' }));
    await user.click(screen.getByRole('button', { name: /Delete 1 selected/ }));

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.tasks.map((t: { title: string }) => t.title)).not.toContain('Algorithms problem set 6');
    expect(screen.getByText('Deleted "Algorithms problem set 6"')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).tasks.map((t: { title: string }) => t.title)).toContain('Algorithms problem set 6');
  });

  it('deletes every task due on the days picked in deletion mode', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Try it with sample tasks' }));
    await user.click(screen.getByRole('button', { name: 'Month' }));
    await user.click(screen.getByRole('button', { name: /Deletion mode/ }));
    await user.click(screen.getByRole('button', { name: 'Wednesday, November 4' }));
    await user.click(screen.getByRole('button', { name: 'Friday, November 6' }));
    // Their daily flashcard copies are due those days too.
    expect(screen.getByText('4 tasks due on 2 days')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Delete 4 tasks/ }));

    const titles = JSON.parse(localStorage.getItem(STORAGE_KEY)!).tasks.map((t: { title: string }) => t.title);
    expect(titles).not.toContain('Algorithms problem set 6');
    expect(titles).not.toContain('Database systems lab report');
    expect(titles).toContain('Reply to internship recruiter');
  });

  it('deletes the whole calendar only after typing delete, keeping work hours', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Try it with sample tasks' }));
    await user.click(screen.getByRole('button', { name: 'Schedule' }));
    await user.click(screen.getByRole('button', { name: /Delete my calendar/ }));
    const dialog = screen.getByRole('dialog', { name: 'Delete your whole calendar?' });
    const confirm = within(dialog).getByRole('button', { name: 'Delete everything' });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Type delete to confirm'), 'delet');
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Type delete to confirm'), 'e');
    expect(within(dialog).getByLabelText('Type delete to confirm')).toHaveValue('delete');
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.tasks).toEqual([]);
    expect(saved.events).toEqual([]);
    expect(saved.series).toEqual([]);
    expect(saved.weeklyHours[1]).toEqual([{ start: 12 * 60, end: 18 * 60 }]);
  });

  it('uses the day picked on the month calendar for the add buttons at the top', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Month' }));
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    await user.click(screen.getByRole('button', { name: 'Wednesday, October 28' }));

    await user.click(screen.getByRole('button', { name: 'Add event' }));
    let dialog = screen.getByRole('dialog', { name: 'Add to your calendar' });
    expect(within(dialog).getByLabelText('Date')).toHaveValue('2026-10-28');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await user.click(screen.getByRole('button', { name: 'Add task' }));
    dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Due date')).toHaveValue('2026-10-28');
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

  it('adds a trip over several days, and an event every other week with a place and notes', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Month' }));
    await user.click(screen.getByRole('button', { name: 'Friday, November 6' }));
    await user.click(screen.getByRole('button', { name: 'Event' }));
    let dialog = screen.getByRole('dialog', { name: 'Add to your calendar' });
    await user.type(within(dialog).getByLabelText('Name'), 'Trip to Flagstaff');
    await user.click(within(dialog).getByLabelText('All day'));
    await user.type(within(dialog).getByLabelText('Last day (optional)'), '2026-11-08');
    await user.click(within(dialog).getByRole('button', { name: 'Add event' }));
    expect(screen.getByRole('button', { name: 'Sunday, November 8' })).toHaveTextContent('Trip to Flagstaff');
    expect(screen.getByRole('button', { name: 'Monday, November 9' })).not.toHaveTextContent('Trip to Flagstaff');

    await user.click(screen.getByRole('button', { name: 'Tuesday, November 3' }));
    await user.click(screen.getByRole('button', { name: 'Event' }));
    dialog = screen.getByRole('dialog', { name: 'Add to your calendar' });
    await user.type(within(dialog).getByLabelText('Name'), 'Lab meeting');
    await user.selectOptions(within(dialog).getByLabelText('Repeats'), 'Every 2 weeks');
    await user.type(within(dialog).getByLabelText('Location (optional)'), 'Coor Hall 170');
    expect(within(dialog).getByRole('link', { name: 'Open in Maps' })).toHaveAttribute('href', 'https://maps.apple.com/?q=Coor%20Hall%20170');
    await user.type(within(dialog).getByLabelText('Notes (optional)'), 'Bring the draft');
    await user.click(within(dialog).getByRole('button', { name: 'Add event' }));

    expect(screen.getByRole('button', { name: 'Tuesday, November 17' })).toHaveTextContent('Lab meeting');
    expect(screen.getByRole('button', { name: 'Tuesday, November 10' })).not.toHaveTextContent('Lab meeting');
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!).events;
    expect(saved).toContainEqual(expect.objectContaining({ title: 'Trip to Flagstaff', date: '2026-11-06', endDate: '2026-11-08', allDay: true }));
    expect(saved).toContainEqual(
      expect.objectContaining({ title: 'Lab meeting', repeat: 'weekly', rule: 'biweekly', location: 'Coor Hall 170', notes: 'Bring the draft' }),
    );
  });

  it('changes or cancels just one day of a repeating event', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Try it with sample tasks' }));
    await user.click(screen.getByRole('button', { name: 'Month' }));

    // Team standup repeats every Monday from Nov 2. Move just the Nov 9 one to 3pm.
    await user.click(screen.getByRole('button', { name: 'Monday, November 9' }));
    await user.click(screen.getByRole('button', { name: /^Team standup/ }));
    let dialog = screen.getByRole('dialog', { name: 'Edit event' });
    expect(within(dialog).getByRole('radio', { name: 'Only Mon, Nov 9' })).toHaveAttribute('aria-checked', 'true');
    expect(within(dialog).queryByLabelText('Repeats')).not.toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText('Starts'));
    await user.type(within(dialog).getByLabelText('Starts'), '15:00');
    await user.clear(within(dialog).getByLabelText('Ends'));
    await user.type(within(dialog).getByLabelText('Ends'), '15:30');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('button', { name: 'Monday, November 9' })).toHaveTextContent(/Team standup\s*3pm/);
    expect(screen.getByRole('button', { name: 'Monday, November 16' })).toHaveTextContent(/Team standup\s*1pm/);

    // Cancel the Nov 16 one; the week after still has it.
    await user.click(screen.getByRole('button', { name: 'Monday, November 16' }));
    await user.click(screen.getByRole('button', { name: /^Team standup/ }));
    dialog = screen.getByRole('dialog', { name: 'Edit event' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete this day' }));
    expect(screen.getByRole('button', { name: 'Monday, November 16' })).not.toHaveTextContent('Team standup');
    expect(screen.getByRole('button', { name: 'Monday, November 23' })).toHaveTextContent('Team standup');
    expect(screen.getByText('Cancelled "Team standup" on Mon, Nov 16')).toBeInTheDocument();

    // Editing every day keeps the days changed or cancelled on their own.
    await user.click(screen.getByRole('button', { name: 'Monday, November 23' }));
    await user.click(screen.getByRole('button', { name: /^Team standup/ }));
    dialog = screen.getByRole('dialog', { name: 'Edit event' });
    await user.click(within(dialog).getByRole('radio', { name: 'Every day it repeats' }));
    await user.type(within(dialog).getByLabelText('Name'), ' (team)');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!).events;
    expect(saved).toContainEqual(expect.objectContaining({ title: 'Team standup (team)', repeat: 'weekly', skip: ['2026-11-09', '2026-11-16'] }));
    expect(saved).toContainEqual(expect.objectContaining({ title: 'Team standup', date: '2026-11-09', repeat: 'none', start: 15 * 60 }));
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
    expect(within(dialog).getByLabelText('Stops repeating after (optional)')).toHaveValue('2028-10-01');
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
