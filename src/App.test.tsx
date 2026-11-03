import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { StoreProvider } from './state/StoreProvider';

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
