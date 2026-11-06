import { nextDayOf } from './availability';
import type { ISODate } from './dates';
import { isTaskComplete, loggedMinutesByTask } from '../state/planner';
import type { AppData, Task } from '../state/types';

const MAX_RESULTS = 30;

/** Lowercased, without accents, so "cafe" finds "Café". */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function matches(words: string[], ...fields: (string | undefined)[]): boolean {
  const haystack = fold(fields.filter(Boolean).join(' '));
  return words.every((w) => haystack.includes(w));
}

/**
 * Finds tasks and events whose name, place or notes have every word of `query`. Null for an empty query.
 * Events come soonest first; a repeating task is listed once, by its next open day, or as the
 * repeating task itself when it has no open day.
 */
export function searchData(data: AppData, query: string, today: ISODate) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const seriesById = new Map((data.series ?? []).map((s) => [s.id, s]));
  const matchesSeries = (id: string) => {
    const s = seriesById.get(id);
    return Boolean(s && matches(words, s.title, s.notes));
  };
  const events = data.events
    .filter((e) => matches(words, e.title, e.location, e.notes))
    .map((e) => ({ event: e, next: nextDayOf(e, today) }))
    // Coming up first, soonest first; then ones that are over, latest first.
    .sort((a, b) => (a.next && b.next ? a.next.localeCompare(b.next) : a.next ? -1 : b.next ? 1 : b.event.date.localeCompare(a.event.date)))
    .slice(0, MAX_RESULTS);
  const logged = loggedMinutesByTask(data.logs);
  const done = (t: Task) => isTaskComplete(t, logged.get(t.id) ?? 0);
  // Open first, soonest first, so a repeating task is shown by its next open day.
  const sorted = data.tasks
    .filter((t) => matches(words, t.title, t.notes) || (t.seriesId !== undefined && matchesSeries(t.seriesId)))
    .sort((a, b) => Number(done(a)) - Number(done(b)) || a.dueDate.localeCompare(b.dueDate));
  // One entry per repeating task rather than one for each of its days. With no open day left (it
  // starts later, or only finished days are kept), the repeating task itself is shown instead.
  const seenSeries = new Set<string>();
  const tasks = sorted
    .filter((t) => {
      if (!t.seriesId) return true;
      if (seenSeries.has(t.seriesId)) return false;
      if (seriesById.has(t.seriesId) && done(t)) return false;
      seenSeries.add(t.seriesId);
      return true;
    })
    .slice(0, MAX_RESULTS)
    .map((task) => ({ task, done: done(task) }));
  const series = (data.series ?? [])
    .filter((s) => !seenSeries.has(s.id) && (matchesSeries(s.id) || sorted.some((t) => t.seriesId === s.id)))
    .slice(0, MAX_RESULTS);
  return { events, tasks, series };
}
