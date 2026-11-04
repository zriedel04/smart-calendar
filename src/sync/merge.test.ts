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

  it('keeps a repeating task stopped on one device while the other moved on to a new day', () => {
    const draft = { title: 'Study', estimateMinutes: 60, days: WEEKDAYS, startDate: '2026-11-02' };
    const base = reducer(createEmptyData(), { type: 'series/add', draft, today: '2026-11-02' });
    const id = base.series![0]!.id;
    // On Tuesday the laptop adds next Monday's day, while the phone stops the task.
    const laptop = reducer(base, { type: 'series/fill', today: '2026-11-03' });
    const phone = reducer(base, { type: 'series/stop', id, today: '2026-11-03' });
    for (const merged of [mergeAppData(base, laptop, phone), mergeAppData(base, phone, laptop)]) {
      expect(merged.series).toEqual([]);
      expect(merged.tasks.filter((t) => t.dueDate >= '2026-11-03')).toEqual([]);
    }
    // A real edit on the laptop still wins over the stop.
    const edited = reducer(laptop, { type: 'series/update', id, draft: { ...draft, title: 'Spanish' }, today: '2026-11-03' });
    expect(mergeAppData(base, edited, phone).series?.map((s) => s.title)).toEqual(['Spanish']);
  });

  it("keeps time logged on a repeating task's day that the other device cleared as missed", () => {
    const draft = { title: 'Study', estimateMinutes: 60, days: WEEKDAYS, startDate: '2026-11-02' };
    const base = reducer(createEmptyData(), { type: 'series/add', draft, today: '2026-11-02' });
    const monday = base.tasks.find((t) => t.dueDate === '2026-11-02')!;
    // The phone logs 30 minutes on Monday's day offline; the laptop opens on Tuesday and clears it.
    const phone = reducer(base, { type: 'work/log', taskId: monday.id, minutes: 30, date: '2026-11-02' });
    const laptop = reducer(base, { type: 'series/fill', today: '2026-11-03' });
    expect(laptop.tasks.some((t) => t.id === monday.id)).toBe(false);
    for (const merged of [mergeAppData(base, phone, laptop), mergeAppData(base, laptop, phone)]) {
      expect(merged.tasks.some((t) => t.id === monday.id)).toBe(true);
      expect(merged.logs.reduce((sum, l) => sum + l.minutes, 0)).toBe(30);
    }
  });

  it("drops new days that don't fit a repeating task changed on the other device", () => {
    const draft = { title: 'Study', estimateMinutes: 60, days: WEEKDAYS, startDate: '2026-11-02' };
    const base = reducer(createEmptyData(), { type: 'series/add', draft, today: '2026-11-02' });
    const id = base.series![0]!.id;
    // On Tuesday the laptop adds next Monday's day, while the phone changes the task to Tuesdays only.
    const laptop = reducer(base, { type: 'series/fill', today: '2026-11-03' });
    const phone = reducer(base, { type: 'series/update', id, draft: { ...draft, days: [2] }, today: '2026-11-03' });
    for (const merged of [mergeAppData(base, laptop, phone), mergeAppData(base, phone, laptop)]) {
      const filled = reducer(merged, { type: 'series/fill', today: '2026-11-03' });
      const upcoming = filled.tasks.filter((t) => t.seriesId === id && t.dueDate >= '2026-11-03').map((t) => t.dueDate);
      expect(upcoming.sort()).toEqual(['2026-11-03']);
    }
  });

  it('gives a new day the details of a repeating task renamed on the other device', () => {
    const draft = { title: 'Study', estimateMinutes: 60, days: WEEKDAYS, startDate: '2026-11-02' };
    const base = reducer(createEmptyData(), { type: 'series/add', draft, today: '2026-11-02' });
    const id = base.series![0]!.id;
    const laptop = reducer(base, { type: 'series/fill', today: '2026-11-03' });
    const phone = reducer(base, { type: 'series/update', id, draft: { ...draft, title: 'Spanish' }, today: '2026-11-03' });
    for (const merged of [mergeAppData(base, laptop, phone), mergeAppData(base, phone, laptop)]) {
      const filled = reducer(merged, { type: 'series/fill', today: '2026-11-04' });
      const monday = filled.tasks.filter((t) => t.dueDate === '2026-11-09');
      expect(monday.map((t) => t.title)).toEqual(['Spanish']);
    }
  });

  it('drops a day skipped on one device while the other renamed the task', () => {
    const draft = { title: 'Study', estimateMinutes: 60, days: WEEKDAYS, startDate: '2026-11-02' };
    const base = reducer(createEmptyData(), { type: 'series/add', draft, today: '2026-11-02' });
    const id = base.series![0]!.id;
    const friday = base.tasks.find((t) => t.dueDate === '2026-11-06')!;
    const phone = reducer(base, { type: 'task/skip', id: friday.id });
    const laptop = reducer(base, { type: 'series/update', id, draft: { ...draft, title: 'Spanish' }, today: '2026-11-03' });
    for (const merged of [mergeAppData(base, laptop, phone), mergeAppData(base, phone, laptop)]) {
      const filled = reducer(merged, { type: 'series/fill', today: '2026-11-03' });
      expect(filled.tasks.some((t) => t.dueDate === '2026-11-06')).toBe(false);
      expect(filled.series![0]!.title).toBe('Spanish');
    }
  });

  it('keeps a skip taken back with Undo while the skip was syncing', () => {
    const draft = { title: 'Study', estimateMinutes: 60, days: WEEKDAYS, startDate: '2026-11-02' };
    const before = reducer(createEmptyData(), { type: 'series/add', draft, today: '2026-11-02' });
    const friday = before.tasks.find((t) => t.dueDate === '2026-11-06')!;
    const skipped = reducer(before, { type: 'task/skip', id: friday.id });
    // The skip was saved; meanwhile Undo brought Friday back on this device.
    const merged = mergeAppData(skipped, before, skipped);
    expect(merged.series![0]!.skipped).toBeUndefined();
    expect(merged.tasks.some((t) => t.id === friday.id)).toBe(true);
  });

  it("keeps a repeating task's day ticked off on one device that the other cleared as missed", () => {
    const draft = { title: 'Study', estimateMinutes: 60, days: WEEKDAYS, startDate: '2026-11-02' };
    const base = reducer(createEmptyData(), { type: 'series/add', draft, today: '2026-11-02' });
    const monday = base.tasks.find((t) => t.dueDate === '2026-11-02')!;
    const phone = reducer(base, { type: 'task/setComplete', id: monday.id, complete: true });
    const laptop = reducer(base, { type: 'series/fill', today: '2026-11-03' });
    for (const merged of [mergeAppData(base, phone, laptop), mergeAppData(base, laptop, phone)]) {
      expect(merged.tasks.find((t) => t.id === monday.id)?.completedAt).toBeDefined();
    }
  });

  it("keeps a finished repeating day deleted on purpose deleted", () => {
    const draft = { title: 'Study', estimateMinutes: 60, days: WEEKDAYS, startDate: '2026-11-02' };
    let base = reducer(createEmptyData(), { type: 'series/add', draft, today: '2026-11-02' });
    const monday = base.tasks.find((t) => t.dueDate === '2026-11-02')!;
    base = reducer(base, { type: 'task/setComplete', id: monday.id, complete: true });
    const phone = reducer(base, { type: 'task/delete', id: monday.id });
    for (const merged of [mergeAppData(base, phone, base), mergeAppData(base, base, phone)]) {
      expect(merged.tasks.some((t) => t.id === monday.id)).toBe(false);
    }
  });

  it('keeps a day skipped on one device while the other moved on to a new day', () => {
    const draft = { title: 'Study', estimateMinutes: 60, days: WEEKDAYS, startDate: '2026-11-02' };
    const base = reducer(createEmptyData(), { type: 'series/add', draft, today: '2026-11-02' });
    const id = base.series![0]!.id;
    const friday = base.tasks.find((t) => t.dueDate === '2026-11-06')!;
    const phone = reducer(base, { type: 'task/skip', id: friday.id });
    const laptop = reducer(base, { type: 'series/fill', today: '2026-11-03' });
    for (let merged of [mergeAppData(base, phone, laptop), mergeAppData(base, laptop, phone)]) {
      expect(merged.series![0]!.skipped).toEqual(['2026-11-06']);
      // Editing the series later doesn't bring Friday back.
      merged = reducer(merged, { type: 'series/update', id, draft: { ...draft, title: 'Spanish' }, today: '2026-11-03' });
      expect(merged.tasks.some((t) => t.dueDate === '2026-11-06')).toBe(false);
    }
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
