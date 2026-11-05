import type { CalendarEvent } from '../lib/availability';
import type { ISODate } from '../lib/dates';
import type { IcsEntry } from '../lib/ics';
import { isPast, toEventDrafts, toTaskDraft } from './calendarImport';
import type { AppData, CalendarFeed, Task } from './types';

/** How long a calendar link's copy is trusted before it's fetched again. */
export const FEED_REFRESH_MS = 3 * 60 * 60 * 1000;

/**
 * Items from a link get the same id on every device, so two devices refreshing the same link at
 * once add each item only once when their calendars are merged.
 */
export const feedItemId = (feedId: string, uid: string, part?: string) =>
  `feed:${feedId}:${uid}${part === undefined ? '' : `:${part}`}`;

/**
 * What a deleted item from a link is remembered by, so refreshing doesn't bring it back: a task by
 * its calendar entry, an event by which run and day of its entry it is (`sourceKey`), which stays
 * the same however you edit it and whatever happens to the entry's other runs.
 */
export function dismissKey(item: Pick<Task, 'sourceId'> | Pick<CalendarEvent, 'id' | 'date' | 'sourceKey'>): string {
  return 'date' in item ? `event:${item.sourceKey ?? item.id}` : `task:${item.sourceId}`;
}

/** A readable name for a link, such as "Canvas" for a Canvas calendar feed. */
export function feedName(url: string): string {
  try {
    const host = new URL(url.replace(/^webcal:/i, 'https:')).hostname;
    if (/instructure\.com$|canvas/i.test(host)) return 'Canvas';
    if (/google\.com$/i.test(host)) return 'Google Calendar';
    if (/outlook|office365|live\.com$/i.test(host)) return 'Outlook';
    if (/icloud\.com$/i.test(host)) return 'Apple Calendar';
    return host.replace(/^www\./, '');
  } catch {
    return 'Calendar';
  }
}

/** The https form of a calendar link, or null if it isn't one. `webcal:` links are https underneath. */
export function normalizeFeedUrl(input: string): string | null {
  const text = input.trim().replace(/^webcals?:\/\//i, 'https://');
  try {
    const url = new URL(text);
    return url.protocol === 'https:' && url.hostname ? url.toString() : null;
  } catch {
    return null;
  }
}

function startedTasks(data: AppData): Set<string> {
  const ids = new Set(data.logs.map((l) => l.taskId));
  if (data.timer) ids.add(data.timer.taskId);
  return ids;
}

/** True once an event can't happen again. */
function eventOver(event: CalendarEvent, today: ISODate): boolean {
  if (event.repeat === 'none') return event.date < today;
  return event.until !== undefined && event.until < today;
}

/**
 * Brings what a calendar link added up to date with its latest copy:
 * - new assignments become tasks (with the link's estimate) and other entries become events,
 * - an item the link changed gets its new title, date or time, unless only you changed it,
 * - an upcoming item the link dropped is removed, unless you started or finished it,
 * - items you deleted, and entries that are already over, aren't added.
 * Entries brought in earlier from a file of the same calendar are taken over, not added twice.
 *
 * Returns `data` itself when nothing changed.
 */
export function applyFeed(data: AppData, feedId: string, entries: readonly IcsEntry[], today: ISODate, now: string): AppData {
  const feed = data.feeds?.find((f) => f.id === feedId);
  if (!feed) return data;
  const dismissed = new Set(feed.dismissed ?? []);
  const ours = (item: { feedId?: string; sourceId?: string }) => item.feedId === feed.id || (!item.feedId && item.sourceId !== undefined);
  const uids = new Set(entries.map((e) => e.uid));
  const started = startedTasks(data);
  let changed = false;

  let tasks = [...data.tasks];
  let events = [...data.events];
  const added: { tasks: Task[]; events: CalendarEvent[] } = { tasks: [], events: [] };

  // A repeating entry can come back as several runs with the same UID (Monday, Wednesday and
  // Friday, or before and after a clock change), so each UID is handled as one group.
  const byUid = new Map<string, IcsEntry[]>();
  for (const entry of entries) byUid.set(entry.uid, [...(byUid.get(entry.uid) ?? []), entry]);

  for (const [uid, runs] of byUid) {
    const first = runs[0]!;
    if (first.looksLikeAssignment) {
      const draft = toTaskDraft(first, feed.estimateMinutes);
      const stamp = JSON.stringify([draft.title, draft.dueDate]);
      const i = tasks.findIndex((t) => t.sourceId === uid && ours(t));
      if (i >= 0) {
        const task = tasks[i]!;
        if (!task.feedId) {
          tasks[i] = { ...task, feedId: feed.id, sourceStamp: stamp };
          changed = true;
        } else if (task.sourceStamp !== stamp) {
          tasks[i] = { ...task, title: draft.title, dueDate: draft.dueDate, sourceStamp: stamp };
          changed = true;
        }
      } else if (!isPast(first, 'task', today) && !dismissed.has(dismissKey(draft))) {
        added.tasks.push({ ...draft, id: feedItemId(feed.id, uid), createdAt: now, feedId: feed.id, sourceStamp: stamp });
      }
      continue;
    }

    // Each event is known by its run's first date and its day within the run, not by its position,
    // so a run added or dropped at the source doesn't shift the others. A one-off event is known by
    // its day alone, so one deleted here stays deleted when it's moved to another date at the source.
    const oneOff = runs.length === 1 && first.repeat === 'none';
    const keyed = runs.flatMap((run) =>
      toEventDrafts(run).map((d, day) => ({ d, key: `${uid}:${oneOff ? '' : run.date}+${day}` })),
    );
    const drafts = keyed.map((k) => k.d);
    const stamp = JSON.stringify(drafts);
    const group = events.filter((e) => e.sourceId === uid && ours(e));
    const fresh = () =>
      keyed
        .map(({ d, key }): CalendarEvent => ({
          ...d,
          id: feedItemId(feed.id, uid, key.slice(uid.length + 1)),
          feedId: feed.id,
          sourceStamp: stamp,
          sourceKey: key,
        }))
        .filter((e) => !dismissed.has(dismissKey(e)));
    if (group.length > 0) {
      if (group.some((e) => !e.feedId)) {
        // Events imported from a file keep their ids and edits, and learn which run and day they are,
        // so deleting one later is remembered. Each is matched to the run on its date if there is one,
        // then to the runs left in date order; runs the file didn't have are added.
        const ordered = [...group].sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
        const left = [...keyed].sort((a, b) => a.d.date.localeCompare(b.d.date) || a.d.start - b.d.start);
        const keyOf = new Map<CalendarEvent, string>();
        const take = (e: CalendarEvent, i: number) => {
          if (i < 0) return;
          keyOf.set(e, left[i]!.key);
          left.splice(i, 1);
        };
        for (const e of ordered) take(e, left.findIndex((k) => k.d.date === e.date));
        for (const e of ordered) if (!keyOf.has(e)) take(e, left.length ? 0 : -1);
        for (const e of ordered) if (!keyOf.has(e)) keyOf.set(e, `${uid}:${oneOff ? '' : e.date}+0`);
        const missing = new Set(left.map((k) => k.key));
        events = [
          ...events.map((e) => (keyOf.has(e) ? { ...e, feedId: feed.id, sourceStamp: stamp, sourceKey: keyOf.get(e)! } : e)),
          ...fresh().filter((e) => missing.has(e.sourceKey!)),
        ];
        changed = true;
      } else if (group.some((e) => e.sourceStamp !== stamp)) {
        events = [...events.filter((e) => !group.includes(e)), ...fresh()];
        changed = true;
      }
    } else if (!runs.every((run) => isPast(run, 'event', today))) {
      added.events.push(...fresh());
    }
  }

  // Upcoming items the link no longer has were removed or cancelled at the source. An empty copy is
  // more likely a hiccup at the source than every item being cancelled, so it removes nothing.
  const keep = entries.length === 0;
  const keptTasks = tasks.filter(
    (t) =>
      keep ||
      t.feedId !== feed.id ||
      uids.has(t.sourceId ?? '') ||
      t.dueDate < today ||
      t.completedAt !== undefined ||
      started.has(t.id),
  );
  const keptEvents = events.filter((e) => keep || e.feedId !== feed.id || uids.has(e.sourceId ?? '') || eventOver(e, today));
  if (keptTasks.length !== tasks.length || keptEvents.length !== events.length) changed = true;
  tasks = keptTasks;
  events = keptEvents;

  if (added.tasks.length || added.events.length) changed = true;
  if (!changed) return data;
  return { ...data, tasks: [...tasks, ...added.tasks], events: [...events, ...added.events] };
}

/** Remembers an item from a link that you deleted, so the next refresh doesn't add it again. */
/** The item as if imported from a file: kept, but no longer tied to a link. */
export function detachFromFeed<T extends Task | CalendarEvent>(item: T): T {
  const { feedId: _feed, sourceStamp: _stamp, ...rest } = item;
  if ('sourceKey' in rest) delete (rest as { sourceKey?: string }).sourceKey;
  return rest as T;
}

export function dismissFromFeed(data: AppData, item: Task | CalendarEvent): CalendarFeed[] | undefined {
  if (!item.feedId || !item.sourceId || !data.feeds) return data.feeds;
  const key = dismissKey(item);
  return data.feeds.map((f) =>
    f.id === item.feedId && !f.dismissed?.includes(key) ? { ...f, dismissed: [...(f.dismissed ?? []), key] } : f,
  );
}
