import { describe, expect, it } from 'vitest';
import { createEmptyData } from '../state/defaults';
import type { AppData, Task } from '../state/types';
import { mergeAppData, sameData } from './merge';

const task = (id: string, title = id): Task => ({ id, title, dueDate: '2026-11-10', estimateMinutes: 60, createdAt: '2026-11-01T00:00:00.000Z' });
const withTasks = (...tasks: Task[]): AppData => ({ ...createEmptyData(), tasks });

describe('sameData', () => {
  it('ignores key order and treats missing like undefined', () => {
    expect(sameData({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true);
    expect(sameData({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(sameData({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
    expect(sameData({ a: 1 }, { a: '1' })).toBe(false);
  });
});

describe('mergeAppData', () => {
  it('keeps tasks added on each device', () => {
    const base = withTasks(task('a'));
    const merged = mergeAppData(base, withTasks(task('a'), task('phone')), withTasks(task('a'), task('laptop')));
    expect(merged.tasks.map((t) => t.id)).toEqual(['a', 'phone', 'laptop']);
  });

  it('keeps a deletion from either device, and an edit made on the other', () => {
    const base = withTasks(task('a'), task('b'));
    const merged = mergeAppData(base, withTasks(task('b', 'Renamed')), withTasks(task('a'), task('b')));
    expect(merged.tasks).toEqual([task('b', 'Renamed')]);
    const fromRemote = mergeAppData(base, withTasks(task('a'), task('b')), withTasks(task('a', 'Edited')));
    expect(fromRemote.tasks).toEqual([task('a', 'Edited')]);
  });

  it('lets this device win when both changed the same thing', () => {
    const base = withTasks(task('a'));
    expect(mergeAppData(base, withTasks(task('a', 'Mine')), withTasks(task('a', 'Theirs'))).tasks[0]?.title).toBe('Mine');
  });

  it('merges hours, day changes and the timer, and drops work logged on a task deleted elsewhere', () => {
    const base: AppData = { ...withTasks(task('a'), task('b')), overrides: { '2026-11-05': [] } };
    const local: AppData = {
      ...base,
      overrides: { '2026-11-05': [], '2026-11-06': [{ start: 600, end: 720 }] },
      logs: [{ id: 'l1', taskId: 'b', date: '2026-11-04', minutes: 30 }],
      timer: { taskId: 'b', startedAt: '2026-11-04T18:00:00.000Z' },
    };
    const remote: AppData = {
      ...withTasks(task('a')),
      weeklyHours: base.weeklyHours.map(() => [{ start: 540, end: 1020 }]),
      overrides: {},
    };
    const merged = mergeAppData(base, local, remote);
    expect(merged.weeklyHours).toEqual(remote.weeklyHours);
    expect(merged.overrides).toEqual({ '2026-11-06': [{ start: 600, end: 720 }] });
    expect(merged.tasks.map((t) => t.id)).toEqual(['a']);
    expect(merged.logs).toEqual([]);
    expect(merged).not.toHaveProperty('timer');
  });
});
