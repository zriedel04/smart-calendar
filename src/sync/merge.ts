import { weekdayOf } from '../lib/dates';
import { copyOf } from '../state/recurring';
import type { AppData, Task, TaskSeries } from '../state/types';

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
function pick<T>(base: T, local: T, remote: T, same: (a: T, b: T) => boolean = sameData): T {
  if (sameData(local, remote)) return local;
  if (same(local, base)) return remote;
  if (same(remote, base)) return local;
  return local;
}

/**
 * A repeating task's own details, without the bookkeeping the app updates by itself each day
 * (how far its copies are made, and skipped days that have passed). Moving to a new day isn't an
 * edit, so it mustn't win over stopping the task on the other device.
 */
function seriesDetails(series: TaskSeries | undefined) {
  if (!series) return series;
  const { filledThrough: _filled, skipped: _skipped, ...details } = series;
  return details;
}
const sameSeries = (a: TaskSeries | undefined, b: TaskSeries | undefined) => sameData(seriesDetails(a), seriesDetails(b));

/** Merges two lists of items with ids, item by item, so adding, editing and deleting on either side all carry over. */
function mergeById<T extends { id: string }>(
  base: readonly T[],
  local: readonly T[],
  remote: readonly T[],
  same?: (a: T | undefined, b: T | undefined) => boolean,
): T[] {
  const byId = (items: readonly T[]) => new Map(items.map((item) => [item.id, item]));
  const b = byId(base);
  const l = byId(local);
  const r = byId(remote);
  // Keep this device's order, then add anything new from the other device.
  const ids = [...l.keys(), ...[...r.keys()].filter((id) => !l.has(id))];
  const merged: T[] = [];
  for (const id of ids) {
    const item = pick(b.get(id), l.get(id), r.get(id), same);
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
 * Repeating tasks' copies made before copies had the same id on every device can show up twice
 * for one day after a merge. Keep one per series and day (the one you started, if any) and move
 * any logged work and timer onto it.
 */
function dedupeCopies(data: AppData) {
  const started = new Set([...data.logs.map((l) => l.taskId), ...(data.timer ? [data.timer.taskId] : [])]);
  const keep = new Map<string, string>();
  const replaced = new Map<string, string>();
  const score = (t: AppData['tasks'][number]) => (started.has(t.id) ? 2 : 0) + (t.completedAt ? 1 : 0);
  for (const task of data.tasks) {
    if (!task.seriesId) continue;
    const key = `${task.seriesId}/${task.dueDate}`;
    const kept = keep.get(key);
    if (!kept) {
      keep.set(key, task.id);
      continue;
    }
    const keptTask = data.tasks.find((t) => t.id === kept)!;
    const [winner, loser] = score(task) > score(keptTask) ? [task.id, kept] : [kept, task.id];
    keep.set(key, winner);
    replaced.set(loser, winner);
  }
  if (replaced.size === 0) return;
  const target = (id: string) => {
    let next = id;
    while (replaced.has(next)) next = replaced.get(next)!;
    return next;
  };
  data.tasks = data.tasks.filter((t) => !replaced.has(t.id));
  data.logs = data.logs.map((l) => (replaced.has(l.taskId) ? { ...l, taskId: target(l.taskId) } : l));
  if (data.timer && replaced.has(data.timer.taskId)) data.timer = { ...data.timer, taskId: target(data.timer.taskId) };
}

/**
 * A repeating task stopped on one device while the other moved on to a new day: the other device
 * made copies for the new day that the stopping device never saw. Drop those, unless you started
 * or finished one. Copies both devices already had were dropped by the stop itself.
 */
function dropCopiesOfStoppedSeries(base: AppData, data: AppData) {
  const live = new Set((data.series ?? []).map((s) => s.id));
  const stopped = new Set((base.series ?? []).map((s) => s.id).filter((id) => !live.has(id)));
  if (stopped.size === 0) return;
  const inBase = new Set(base.tasks.map((t) => t.id));
  const started = new Set([...data.logs.map((l) => l.taskId), ...(data.timer ? [data.timer.taskId] : [])]);
  data.tasks = data.tasks.filter(
    (t) => !t.seriesId || !stopped.has(t.seriesId) || inBase.has(t.id) || t.completedAt || started.has(t.id),
  );
}

/**
 * Merging a series ignores `skipped`, so that the app tidying away passed days isn't treated as an
 * edit. Skipped days are merged day by day against the base instead: a day skipped on either device
 * stays skipped, and a skip taken back (with Undo) or tidied away stays gone.
 */
function mergeSkips(base: AppData, local: AppData, remote: AppData, data: AppData) {
  const skipsOf = (d: AppData) => new Map((d.series ?? []).map((s) => [s.id, new Set(s.skipped ?? [])]));
  const b = skipsOf(base);
  const l = skipsOf(local);
  const r = skipsOf(remote);
  data.series = data.series?.map((s) => {
    const { skipped: _skipped, ...rest } = s;
    const [bs, ls, rs] = [b.get(s.id), l.get(s.id), r.get(s.id)];
    const days = new Set([...(bs ?? []), ...(ls ?? []), ...(rs ?? [])]);
    const skipped = [...days].filter((d) => pick(bs?.has(d) ?? false, ls?.has(d) ?? rs?.has(d) ?? false, rs?.has(d) ?? ls?.has(d) ?? false)).sort();
    return skipped.length ? { ...rest, skipped } : rest;
  });
}

/**
 * The app clears a repeating task's missed day by itself once the day has passed. If the other
 * device logged time, started a timer or ticked the day off meanwhile, bring the day back so the
 * work isn't lost. The next fill marks a started day finished.
 */
function keepStartedCopies(base: AppData, local: AppData, remote: AppData, data: AppData) {
  const finishedInBase = new Set(base.tasks.filter((t) => t.completedAt).map((t) => t.id));
  const present = new Set(data.tasks.map((t) => t.id));
  const started = new Set([...data.logs.map((l) => l.taskId), ...(data.timer ? [data.timer.taskId] : [])]);
  for (const t of [...local.tasks, ...remote.tasks]) {
    if (present.has(t.id) || !t.seriesId) continue;
    // A day finished before the last sync and then deleted on purpose stays deleted.
    if (started.has(t.id) || (t.completedAt && !finishedInBase.has(t.id))) {
      // Prefer a finished copy if one side has it.
      const finished = [...local.tasks, ...remote.tasks].find((c) => c.id === t.id && c.completedAt);
      data.tasks.push(finished ?? t);
      present.add(t.id);
    }
  }
}

/**
 * One device made new days for a repeating task while the other changed it, say renamed it or moved
 * it to Tuesdays only. A new day that's no longer on the task's schedule is dropped; one that still
 * is gets the task's current details. Skipped days go. Days you started or finished are left alone.
 */
function fitCopiesToSeries(base: AppData, data: AppData) {
  const seriesById = new Map((data.series ?? []).map((s) => [s.id, s]));
  const inBase = new Set(base.tasks.map((t) => t.id));
  const started = new Set([...data.logs.map((l) => l.taskId), ...(data.timer ? [data.timer.taskId] : [])]);
  const onSchedule = (date: string, s: TaskSeries) =>
    s.days.includes(weekdayOf(date)) && date >= s.startDate && (!s.until || date <= s.until) && !s.skipped?.includes(date);
  const tasks: Task[] = [];
  for (const t of data.tasks) {
    const s = t.seriesId ? seriesById.get(t.seriesId) : undefined;
    if (!s || t.completedAt || started.has(t.id)) tasks.push(t);
    // A day skipped on either device goes, even if both had it before.
    else if (s.skipped?.includes(t.dueDate)) continue;
    else if (inBase.has(t.id)) tasks.push(t);
    else if (onSchedule(t.dueDate, s)) tasks.push({ ...copyOf(s, t.dueDate, t.createdAt), id: t.id });
  }
  data.tasks = tasks;
}

/** Calendar links, merged like other items. Items you deleted from a link stay deleted whichever device you deleted them on. */
function mergeFeeds(base: AppData, local: AppData, remote: AppData) {
  const dismissedOn = (d: AppData) => new Map((d.feeds ?? []).map((f) => [f.id, f.dismissed ?? []]));
  const l = dismissedOn(local);
  const r = dismissedOn(remote);
  const withoutDismissed = (d: AppData) => (d.feeds ?? []).map(({ dismissed: _d, ...f }) => f);
  return mergeById(withoutDismissed(base), withoutDismissed(local), withoutDismissed(remote)).map((f) => {
    const dismissed = [...new Set([...(l.get(f.id) ?? []), ...(r.get(f.id) ?? [])])];
    return dismissed.length ? { ...f, dismissed } : f;
  });
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
    series: mergeById(base.series ?? [], local.series ?? [], remote.series ?? [], sameSeries),
  };
  const timer = pick(base.timer, local.timer, remote.timer);
  if (timer) merged.timer = timer;
  const feeds = mergeFeeds(base, local, remote);
  if (feeds.length) merged.feeds = feeds;

  mergeSkips(base, local, remote, merged);
  keepStartedCopies(base, local, remote, merged);
  dedupeCopies(merged);
  dropCopiesOfStoppedSeries(base, merged);
  fitCopiesToSeries(base, merged);

  // Work logged or a timer running on a task deleted on the other device would point at nothing.
  const taskIds = new Set(merged.tasks.map((t) => t.id));
  merged.logs = merged.logs.filter((l) => taskIds.has(l.taskId));
  if (merged.timer && !taskIds.has(merged.timer.taskId)) delete merged.timer;
  return merged;
}
