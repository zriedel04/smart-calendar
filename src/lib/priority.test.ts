import { describe, expect, it } from 'vitest';
import { priorityOf } from './priority';

describe('priorityOf', () => {
  const today = '2026-11-03';

  it('marks work due today as urgent', () => {
    expect(priorityOf('2026-11-03', today)).toBe('urgent');
  });

  it('marks work due within the week as needed', () => {
    expect(priorityOf('2026-11-04', today)).toBe('needed');
    expect(priorityOf('2026-11-10', today)).toBe('needed');
  });

  it('marks anything further out as to do', () => {
    expect(priorityOf('2026-11-11', today)).toBe('todo');
  });

  it('flags missed due dates as overdue', () => {
    expect(priorityOf('2026-11-02', today)).toBe('overdue');
  });
});
