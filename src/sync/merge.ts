import { weekdayOf } from '../lib/dates';
import { copyOf } from '../state/recurring';
import type { CalendarEvent } from '../lib/availability';
import { detachFromFeed, dismissKey } from '../state/feeds';
import type { AppData, CalendarFeed, Task, TaskSeries } from '../state/types';

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

/** An event without the days it skips, which are merged day by day (see mergeSkips). */
function eventDetails(event: CalendarEvent | undefined) {
  if (!event) return event;
  const { skip: _skip, ...details } = event;
  return details;
}
const sameEvent = (a: CalendarEvent | undefined, b: CalendarEvent | undefined) => sameData(eventDetails(a), eventDetails(b));

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

/** Merges one list of days per item (keyed by id) day by day against the base. */
function mergeDays<T extends { id: string }>(
  base: readonly T[],
  local: readonly T[],
  remote: readonly T[],
  merged: readonly T[],
  daysOf: (item: T) => readonly string[] | undefined,
  withDays: (item: T, days: string[]) => T,
): T[] {
  const setsOf = (items: readonly T[]) => new Map(items.map((item) => [item.id, new Set(daysOf(item) ?? [])]));
  const [b, l, r] = [setsOf(base), setsOf(local), setsOf(remote)];
  return merged.map((item) => {
    const [bs, ls, rs] = [b.get(item.id), l.get(item.id), r.get(item.id)];
    const all = new Set([...(bs ?? []), ...(ls ?? []), ...(rs ?? [])]);
    const days = [...all].filter((d) => pick(bs?.has(d) ?? false, ls?.has(d) ?? rs?.has(d) ?? false, rs?.has(d) ?? ls?.has(d) ?? false)).sort();
    return withDays(item, days);
  });
}

/**
 * Merging a series ignores `skipped`, so that the app tidying away passed days isn't treated as an
 * edit, and merging an event ignores `skip`. Those days are merged day by day against the base
 * instead: a day skipped (or changed on its own) on either device stays skipped, and a skip taken
 * back (with Undo) or tidied away stays gone.
 */
function mergeSkips(base: AppData, local: AppData, remote: AppData, data: AppData) {
  if (data.series) {
    data.series = mergeDays(
      base.series ?? [],
      local.series ?? [],
      remote.series ?? [],
      data.series,
      (s) => s.skipped,
      ({ skipped: _skipped, ...rest }, skipped) => (skipped.length ? { ...rest, skipped } : rest),
    );
  }
  data.events = mergeDays(
    base.events,
    local.events,
    remote.events,
    data.events,
    (e) => e.skip,
    // An event that no longer repeats has no days to skip; a skip would hide its only day.
    ({ skip: _skip, ...rest }, skip) => (skip.length && rest.repeat !== 'none' ? { ...rest, skip } : rest),
  );
}

/**
 * A day of a repeating event changed on its own becomes an event with the id `<series>@<day>`. If
 * this device cancelled that same day while the other device changed it, both skip the day but
 * only the other added the changed event; this device wins, so the day stays cancelled.
 */
function keepCancelledDays(base: AppData, local: AppData, remote: AppData, data: AppData) {
  const ids = (d: AppData) => new Set(d.events.map((e) => e.id));
  const inBase = ids(base);
  const inLocal = ids(local);
  const skippedHere = (id: string, day: string) => {
    const before = base.events.find((e) => e.id === id)?.skip ?? [];
    const now = local.events.find((e) => e.id === id)?.skip ?? [];
    return now.includes(day) && !before.includes(day);
  };
  const remoteOnly = new Set(remote.events.filter((e) => !inBase.has(e.id) && !inLocal.has(e.id)).map((e) => e.id));
  data.events = data.events.filter((e) => {
    if (!remoteOnly.has(e.id)) return true;
    const at = e.id.lastIndexOf('@');
    return at < 0 || !skippedHere(e.id.slice(0, at), e.id.slice(at + 1));
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
  // Items from a calendar link go away by themselves when the link drops them or you hide their
  // course, so work on one from the other device brings it back, unless you deleted it yourself.
  const dismissed = new Map((data.feeds ?? []).map((f) => [f.id, new Set(f.dismissed ?? [])]));
  const automatic = (t: Task) => !!t.feedId && dismissed.has(t.feedId) && !dismissed.get(t.feedId)!.has(dismissKey(t));
  for (const t of [...local.tasks, ...remote.tasks]) {
    if (present.has(t.id) || (!t.seriesId && !automatic(t))) continue;
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

/**
 * Calendar links, merged like other items. Deleted items are merged one by one against the base: an
 * item deleted on either device stays deleted, and one brought back with Undo stays back.
 */
function mergeFeeds(base: AppData, local: AppData, remote: AppData) {
  const dismissedOn = (d: AppData) => new Map((d.feeds ?? []).map((f) => [f.id, new Set(f.dismissed ?? [])]));
  const [b, l, r] = [dismissedOn(base), dismissedOn(local), dismissedOn(remote)];
  const hiddenOn = (d: AppData) => new Map((d.feeds ?? []).map((f) => [f.id, new Set(f.hiddenCourses ?? [])]));
  const [bh, lh, rh] = [hiddenOn(base), hiddenOn(local), hiddenOn(remote)];
  const coursesOf = (d: AppData, id: string) => d.feeds?.find((f) => f.id === id)?.courses ?? [];
  // Lists that change one entry at a time are merged entry by entry; the courses a link has are
  // found by refreshing, so they never undo a choice made on the other device.
  const settings = (d: AppData) => (d.feeds ?? []).map(({ dismissed: _d, courses: _c, hiddenCourses: _h, ...f }) => f);
  const byKey = (bs?: Set<string>, ls?: Set<string>, rs?: Set<string>) =>
    [...new Set([...(bs ?? []), ...(ls ?? []), ...(rs ?? [])])]
      .filter((k) => pick(bs?.has(k) ?? false, ls?.has(k) ?? rs?.has(k) ?? false, rs?.has(k) ?? ls?.has(k) ?? false))
      .sort();
  return mergeById(settings(base), settings(local), settings(remote)).map((f): CalendarFeed => {
    const dismissed = byKey(b.get(f.id), l.get(f.id), r.get(f.id));
    const hiddenCourses = byKey(bh.get(f.id), lh.get(f.id), rh.get(f.id));
    const courses = [...new Set([...coursesOf(local, f.id), ...coursesOf(remote, f.id)])].sort();
    return {
      ...f,
      ...(dismissed.length ? { dismissed } : {}),
      ...(courses.length ? { courses } : {}),
      ...(hiddenCourses.length ? { hiddenCourses } : {}),
    };
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
    events: mergeById(base.events, local.events, remote.events, sameEvent),
    weeklyHours: pick(base.weeklyHours, local.weeklyHours, remote.weeklyHours),
    overrides: mergeByKey(base.overrides, local.overrides, remote.overrides),
    series: mergeById(base.series ?? [], local.series ?? [], remote.series ?? [], sameSeries),
  };
  const timer = pick(base.timer, local.timer, remote.timer);
  if (timer) merged.timer = timer;
  const feeds = mergeFeeds(base, local, remote);
  // A link removed on one device leaves what it added behind, as removing it does there, even if
  // the other device refreshed those items meanwhile.
  const feedIds = new Set(feeds.map((f) => f.id));
  const detach = <T extends Task | CalendarEvent>(item: T): T =>
    item.feedId && !feedIds.has(item.feedId) ? detachFromFeed(item) : item;
  merged.tasks = merged.tasks.map(detach);
  merged.events = merged.events.map(detach);
  if (feeds.length) {
    merged.feeds = feeds;
    // An item from a link deleted on one device stays deleted, even if the other refreshed it meanwhile.
    const dismissed = new Map(feeds.map((f) => [f.id, new Set('dismissed' in f ? f.dismissed : [])]));
    const gone = (item: Task | CalendarEvent) => !!item.feedId && !!dismissed.get(item.feedId)?.has(dismissKey(item));
    merged.tasks = merged.tasks.filter((t) => !gone(t));
    merged.events = merged.events.filter((e) => !gone(e));
  }

  mergeSkips(base, local, remote, merged);
  keepCancelledDays(base, local, remote, merged);
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
