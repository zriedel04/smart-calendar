import { describe, expect, it } from 'vitest';
import { createEmptyData } from '../state/defaults';
import type { AppData, Task } from '../state/types';
import { reducer } from '../state/reducer';
import { WEEKDAYS } from '../state/recurring';
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

  it("doesn't double a repeating task's day when both devices fill the same week", () => {
    const draft = { title: 'Study', estimateMinutes: 60, days: WEEKDAYS, startDate: '2026-11-02' };
    const base = reducer(createEmptyData(), { type: 'series/add', draft, today: '2026-11-02' });
    // Each device opens the app on Tuesday and adds next Monday's day on its own.
    const phone = reducer(base, { type: 'series/fill', today: '2026-11-03' });
    const laptop = reducer(base, { type: 'series/fill', today: '2026-11-03' });
    const merged = mergeAppData(base, phone, laptop);
    expect(merged.tasks.filter((t) => t.dueDate === '2026-11-09')).toHaveLength(1);
    expect(merged.tasks).toHaveLength(phone.tasks.length);
  });

  it('keeps one copy of a day made twice before ids matched, with its logged time', () => {
    const copy = (id: string): Task => ({ ...task(id, 'Study'), dueDate: '2026-11-05', seriesId: 's1' });
    const base = createEmptyData();
    const local: AppData = { ...base, tasks: [copy('phone-copy')] };
    const remote: AppData = { ...base, tasks: [copy('laptop-copy')], logs: [{ id: 'l1', taskId: 'laptop-copy', date: '2026-11-05', minutes: 20 }] };
    const merged = mergeAppData(base, local, remote);
    expect(merged.tasks.map((t) => t.id)).toEqual(['laptop-copy']);
    expect(merged.logs).toMatchObject([{ taskId: 'laptop-copy', minutes: 20 }]);
  });

  it('counts a timer stopped on both devices once', () => {
    let base = reducer(createEmptyData(), { type: 'task/add', draft: { title: 'Essay', dueDate: '2026-11-10', estimateMinutes: 120 } });
    const id = base.tasks[0]!.id;
    base = reducer(base, { type: 'timer/start', taskId: id, at: '2026-11-04T18:00:00.000Z', date: '2026-11-04' });
    const phone = reducer(base, { type: 'timer/stop', at: '2026-11-04T18:30:00.000Z', date: '2026-11-04' });
    const laptop = reducer(base, { type: 'timer/stop', at: '2026-11-04T18:31:00.000Z', date: '2026-11-04' });
    const merged = mergeAppData(base, phone, laptop);
    expect(merged.logs).toHaveLength(1);
    expect(merged.logs[0]?.minutes).toBe(30);
    expect(merged).not.toHaveProperty('timer');
  });
});
