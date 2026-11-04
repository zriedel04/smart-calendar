import type { AppData } from '../state/types';

/** True if two JSON-like values hold the same data, whatever order their keys are in. */
export function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    // Missing and undefined are the same thing once saved.
    return (a ?? undefined) === (b ?? undefined);
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => sameData(item, b[i]));
  }
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ra), ...Object.keys(rb)]);
  for (const key of keys) if (!sameData(ra[key], rb[key])) return false;
  return true;
}

/**
 * Three-way choice for one value: `base` is what both sides last agreed on.
 * Whichever side changed it wins; if both changed it differently, this device wins.
 */
function pick<T>(base: T, local: T, remote: T): T {
  if (sameData(local, remote)) return local;
  if (sameData(local, base)) return remote;
  return local;
}

/** Merges two lists of items with ids, item by item, so adding, editing and deleting on either side all carry over. */
function mergeById<T extends { id: string }>(base: readonly T[], local: readonly T[], remote: readonly T[]): T[] {
  const byId = (items: readonly T[]) => new Map(items.map((item) => [item.id, item]));
  const b = byId(base);
  const l = byId(local);
  const r = byId(remote);
  // Keep this device's order, then add anything new from the other device.
  const ids = [...l.keys(), ...[...r.keys()].filter((id) => !l.has(id))];
  const merged: T[] = [];
  for (const id of ids) {
    const item = pick(b.get(id), l.get(id), r.get(id));
    if (item) merged.push(item);
  }
  return merged;
}

/** Merges one date-keyed map, date by date. */
function mergeByKey<V>(base: Record<string, V>, local: Record<string, V>, remote: Record<string, V>): Record<string, V> {
  const out: Record<string, V> = {};
  for (const key of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const value = pick(base[key], local[key], remote[key]);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * Combines this device's calendar with the one saved in the account.
 *
 * `base` is the version both last agreed on (the last successful sync). Comparing each side with it
 * tells a deletion apart from an addition, so a task deleted on the phone stays deleted after the
 * laptop syncs, and a task added on each device keeps both. When the same thing was changed on
 * both devices, this device's change wins.
 */
export function mergeAppData(base: AppData, local: AppData, remote: AppData): AppData {
  const merged: AppData = {
    version: 1,
    tasks: mergeById(base.tasks, local.tasks, remote.tasks),
    logs: mergeById(base.logs, local.logs, remote.logs),
    events: mergeById(base.events, local.events, remote.events),
    weeklyHours: pick(base.weeklyHours, local.weeklyHours, remote.weeklyHours),
    overrides: mergeByKey(base.overrides, local.overrides, remote.overrides),
    series: mergeById(base.series ?? [], local.series ?? [], remote.series ?? []),
  };
  const timer = pick(base.timer, local.timer, remote.timer);
  if (timer) merged.timer = timer;

  // Work logged or a timer running on a task deleted on the other device would point at nothing.
  const taskIds = new Set(merged.tasks.map((t) => t.id));
  merged.logs = merged.logs.filter((l) => taskIds.has(l.taskId));
  if (merged.timer && !taskIds.has(merged.timer.taskId)) delete merged.timer;
  return merged;
}
