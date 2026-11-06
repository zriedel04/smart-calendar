import { describe, expect, it } from 'vitest';
import { createEmptyData } from '../state/defaults';
import type { AppData, Task } from '../state/types';
import { searchData } from './search';

const copy = (id: string, dueDate: string, extra: Partial<Task> = {}): Task => ({
  id,
  title: 'Piano practice',
  estimateMinutes: 30,
  seriesId: 'piano',
  dueDate,
  createdAt: '2026-10-01T00:00:00.000Z',
  ...extra,
});
const piano = {
  id: 'piano',
  title: 'Piano practice',
  estimateMinutes: 30,
  days: [1, 3] as (1 | 3)[],
  startDate: '2026-10-26',
  createdAt: '2026-10-01T00:00:00.000Z',
};

describe('searchData', () => {
  it('lists a repeating task by its next open day, counting logged time as done', () => {
    const data: AppData = {
      ...createEmptyData(),
      series: [piano],
      tasks: [
        copy('ticked', '2026-10-26', { completedAt: '2026-10-26T20:00:00.000Z' }),
        copy('logged', '2026-10-28'),
        copy('next', '2026-11-04'),
      ],
      logs: [{ id: 'l', taskId: 'logged', date: '2026-10-28', minutes: 30 }],
    };
    const found = searchData(data, 'piano', '2026-11-02')!;
    expect(found.tasks).toEqual([{ task: expect.objectContaining({ id: 'next' }), done: false }]);
    expect(found.series).toEqual([]);
  });

  it('lists the repeating task itself, by its current name, when only finished days are kept', () => {
    const data: AppData = {
      ...createEmptyData(),
      series: [{ ...piano, title: 'Guitar practice', startDate: '2027-01-12' }],
      tasks: [copy('old', '2026-10-26', { completedAt: '2026-10-26T20:00:00.000Z' })],
    };
    const found = searchData(data, 'guitar', '2026-11-02')!;
    expect(found.tasks).toEqual([]);
    expect(found.series.map((s) => s.title)).toEqual(['Guitar practice']);
  });

  it('shows a task finished by logging its time as done', () => {
    const data: AppData = {
      ...createEmptyData(),
      tasks: [{ id: 'essay', title: 'Essay', estimateMinutes: 60, dueDate: '2026-11-03', createdAt: '2026-10-01T00:00:00.000Z' }],
      logs: [{ id: 'l', taskId: 'essay', date: '2026-11-02', minutes: 60 }],
    };
    expect(searchData(data, 'essay', '2026-11-02')!.tasks[0]?.done).toBe(true);
  });
});
