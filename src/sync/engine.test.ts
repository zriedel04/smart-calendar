import { describe, expect, it } from 'vitest';
import { createEmptyData } from '../state/defaults';
import type { AppData, Task } from '../state/types';
import { syncCalendar } from './engine';
import { memoryStore } from './memoryStore';

const task = (id: string, title = id): Task => ({ id, title, dueDate: '2026-11-10', estimateMinutes: 60, createdAt: '2026-11-01T00:00:00.000Z' });
const withTasks = (...tasks: Task[]): AppData => ({ ...createEmptyData(), tasks });
const ids = (data: AppData) => data.tasks.map((t) => t.id);

describe('syncCalendar', () => {
  it('uploads this device\'s calendar to a new account', async () => {
    const cloud = memoryStore();
    const result = await syncCalendar(cloud.store, withTasks(task('a')), null);
    expect(result).toMatchObject({ kind: 'synced', state: { version: 1 } });
    expect(ids(cloud.row!.data)).toEqual(['a']);
  });

  it("takes the account's calendar on a device with nothing in it yet", async () => {
    const cloud = memoryStore({ data: withTasks(task('a')), version: 4 });
    const result = await syncCalendar(cloud.store, createEmptyData(), null);
    expect(result.kind === 'synced' && ids(result.data)).toEqual(['a']);
    expect(result.kind === 'synced' && result.state.version).toBe(4);
  });

  it('asks which to keep the first time both have different calendars, then does as told', async () => {
    const cloud = memoryStore({ data: withTasks(task('account')), version: 2 });
    const local = withTasks(task('device'));
    expect(await syncCalendar(cloud.store, local, null)).toMatchObject({ kind: 'choose', remote: { version: 2 } });

    const kept = await syncCalendar(cloud.store, local, null, 'device');
    expect(kept.kind === 'synced' && ids(kept.data)).toEqual(['device']);
    expect(ids(cloud.row!.data)).toEqual(['device']);
    expect(cloud.row!.version).toBe(3);

    const other = memoryStore({ data: withTasks(task('account')), version: 2 });
    const used = await syncCalendar(other.store, local, null, 'account');
    expect(used.kind === 'synced' && ids(used.data)).toEqual(['account']);
    expect(other.row!.version).toBe(2);
  });

  it('saves changes on this device, and saves nothing when nothing changed', async () => {
    const cloud = memoryStore({ data: withTasks(task('a')), version: 1 });
    const state = { version: 1, base: withTasks(task('a')) };
    const unchanged = await syncCalendar(cloud.store, withTasks(task('a')), state);
    expect(unchanged.kind === 'synced' && unchanged.state.version).toBe(1);

    const result = await syncCalendar(cloud.store, withTasks(task('a'), task('b')), state);
    expect(result.kind === 'synced' && result.state.version).toBe(2);
    expect(ids(cloud.row!.data)).toEqual(['a', 'b']);
  });

  it('merges work done on two devices while one was offline', async () => {
    const base = withTasks(task('a'), task('b'));
    const cloud = memoryStore({ data: base, version: 1 });
    // The laptop deletes "b" and adds "laptop" while this phone is offline.
    cloud.saveFromElsewhere(withTasks(task('a'), task('laptop')));
    const result = await syncCalendar(cloud.store, withTasks(task('a'), task('b'), task('phone')), { version: 1, base });
    expect(result.kind === 'synced' && ids(result.data)).toEqual(['a', 'phone', 'laptop']);
    expect(ids(cloud.row!.data)).toEqual(['a', 'phone', 'laptop']);
    expect(cloud.row!.version).toBe(3);
  });

  it("tries again when another device saves at the same moment, without losing that device's change", async () => {
    const base = withTasks(task('a'));
    const cloud = memoryStore({ data: base, version: 1 });
    cloud.raceNextSave(() => cloud.saveFromElsewhere(withTasks(task('a'), task('laptop'))));
    const result = await syncCalendar(cloud.store, withTasks(task('a'), task('phone')), { version: 1, base });
    expect(result.kind === 'synced' && ids(result.data)).toEqual(['a', 'phone', 'laptop']);
    expect(cloud.row!.version).toBe(3);
  });
});
