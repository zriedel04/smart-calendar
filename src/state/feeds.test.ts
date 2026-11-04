import { describe, expect, it } from 'vitest';
import type { IcsEntry } from '../lib/ics';
import { mergeAppData } from '../sync/merge';
import { createEmptyData } from './defaults';
import { feedItemId, feedName, normalizeFeedUrl } from './feeds';
import { reducer } from './reducer';
import type { AppData, CalendarFeed } from './types';

const TODAY = '2026-11-02';
const NOW = '2026-11-02T16:00:00.000Z';
const FEED: CalendarFeed = { id: 'f1', url: 'https://school.instructure.com/feeds/calendars/user_abc.ics', name: 'Canvas', estimateMinutes: 90, addedAt: NOW };

const assignment = (uid: string, title: string, date: string): IcsEntry => ({
  uid, title, date, endDate: date, allDay: false, start: 23 * 60 + 59, end: 23 * 60 + 59, repeat: 'none', looksLikeAssignment: true,
});
const lecture = (uid: string, date: string, start = 600): IcsEntry => ({
  uid, title: 'Biology lecture', date, endDate: date, allDay: false, start, end: start + 75, repeat: 'weekly', until: '2026-12-11', looksLikeAssignment: false,
});

const withFeed = (data: AppData = createEmptyData()): AppData => reducer(data, { type: 'feed/add', feed: FEED });
const apply = (data: AppData, entries: IcsEntry[], today = TODAY) => reducer(data, { type: 'feed/apply', id: FEED.id, entries, today, at: NOW });

describe('calendar links', () => {
  it('adds assignments as tasks with the link estimate, and other entries as events', () => {
    const data = apply(withFeed(), [assignment('a1', 'Essay 2', '2026-11-06'), lecture('l1', '2026-11-03')]);
    expect(data.tasks).toMatchObject([{ id: feedItemId('f1', 'a1'), title: 'Essay 2', dueDate: '2026-11-06', estimateMinutes: 90, feedId: 'f1' }]);
    expect(data.events).toMatchObject([{ title: 'Biology lecture', repeat: 'weekly', start: 600, feedId: 'f1' }]);
  });

  it('changes nothing when the link has nothing new', () => {
    const entries = [assignment('a1', 'Essay 2', '2026-11-06'), lecture('l1', '2026-11-03')];
    const once = apply(withFeed(), entries);
    expect(apply(once, entries)).toBe(once);
  });

  it("updates an item the link changed, but keeps what you changed yourself", () => {
    let data = apply(withFeed(), [assignment('a1', 'Essay 2', '2026-11-06'), lecture('l1', '2026-11-03')]);
    const id = feedItemId('f1', 'a1');
    // You set your own estimate and title; the link later moves the due date.
    data = reducer(data, { type: 'task/update', id, draft: { title: 'Essay 2 (draft)', dueDate: '2026-11-06', estimateMinutes: 180 } });
    data = apply(data, [assignment('a1', 'Essay 2', '2026-11-06'), lecture('l1', '2026-11-03')]);
    expect(data.tasks[0]).toMatchObject({ title: 'Essay 2 (draft)', estimateMinutes: 180 });
    data = apply(data, [assignment('a1', 'Essay 2', '2026-11-09'), lecture('l1', '2026-11-03', 660)]);
    expect(data.tasks[0]).toMatchObject({ title: 'Essay 2', dueDate: '2026-11-09', estimateMinutes: 180 });
    expect(data.events).toHaveLength(1);
    expect(data.events[0]).toMatchObject({ start: 660 });
  });

  it('keeps every run of a repeating entry that comes back as several runs with one UID', () => {
    const runs = [lecture('mwf', '2026-11-02'), lecture('mwf', '2026-11-04'), lecture('mwf', '2026-11-06')];
    const once = apply(withFeed(), runs);
    expect(once.events.map((e) => e.date)).toEqual(['2026-11-02', '2026-11-04', '2026-11-06']);
    expect(new Set(once.events.map((e) => e.id)).size).toBe(3);
    expect(apply(once, runs)).toBe(once);
  });

  it('keeps an item deleted on one device deleted when the other refreshed a change to it', () => {
    const base = apply(withFeed(), [assignment('a1', 'Quiz 1', '2026-11-05')]);
    const phone = reducer(base, { type: 'task/delete', id: feedItemId('f1', 'a1') });
    const laptop = apply(base, [assignment('a1', 'Quiz 1', '2026-11-12')]);
    for (const merged of [mergeAppData(base, laptop, phone), mergeAppData(base, phone, laptop)]) {
      expect(merged.tasks).toEqual([]);
      expect(apply(merged, [assignment('a1', 'Quiz 1', '2026-11-12')]).tasks).toEqual([]);
    }
  });

  it('removes upcoming items the link dropped, unless you started or finished them', () => {
    let data = apply(withFeed(), [
      assignment('a1', 'Quiz 1', '2026-11-05'),
      assignment('a2', 'Lab 3', '2026-11-05'),
      assignment('a3', 'Reading', '2026-11-05'),
      lecture('l1', '2026-11-03'),
    ]);
    data = reducer(data, { type: 'work/log', taskId: feedItemId('f1', 'a2'), date: TODAY, minutes: 30 });
    data = reducer(data, { type: 'task/setComplete', id: feedItemId('f1', 'a3'), complete: true });
    data = apply(data, [assignment('keep', 'Still here', '2026-11-20')]);
    expect(data.tasks.map((t) => t.title).sort()).toEqual(['Lab 3', 'Reading', 'Still here']);
    expect(data.events).toEqual([]);
  });

  it("doesn't remove anything when the link comes back empty", () => {
    const data = apply(withFeed(), [assignment('a1', 'Quiz 1', '2026-11-05')]);
    expect(apply(data, [])).toBe(data);
  });

  it("doesn't bring back an item you deleted, or add entries that are already over", () => {
    let data = apply(withFeed(), [assignment('a1', 'Quiz 1', '2026-11-05')]);
    data = reducer(data, { type: 'task/delete', id: feedItemId('f1', 'a1') });
    data = apply(data, [assignment('a1', 'Quiz 1', '2026-11-05'), assignment('old', 'Last week', '2026-10-26')]);
    expect(data.tasks).toEqual([]);
  });

  it('takes over entries imported earlier from a file of the same calendar', () => {
    let data = withFeed();
    data = reducer(data, { type: 'import/add', tasks: [{ title: 'Essay 2', dueDate: '2026-11-06', estimateMinutes: 120, sourceId: 'a1' }], events: [] });
    data = apply(data, [assignment('a1', 'Essay 2', '2026-11-06')]);
    expect(data.tasks).toHaveLength(1);
    expect(data.tasks[0]).toMatchObject({ estimateMinutes: 120, feedId: 'f1' });
  });

  it('keeps what a removed link added, without updating it any more', () => {
    let data = apply(withFeed(), [assignment('a1', 'Essay 2', '2026-11-06')]);
    data = reducer(data, { type: 'feed/remove', id: 'f1' });
    expect(data.feeds).toBeUndefined();
    expect(data.tasks).toHaveLength(1);
    expect(data.tasks[0]).not.toHaveProperty('feedId');
  });

  it('adds each item once when two devices refresh the same link before syncing', () => {
    const base = withFeed();
    const entries = [assignment('a1', 'Essay 2', '2026-11-06'), lecture('l1', '2026-11-03')];
    const merged = mergeAppData(base, apply(base, entries), apply(base, entries));
    expect(merged.tasks).toHaveLength(1);
    expect(merged.events).toHaveLength(1);
  });

  it('keeps an item deleted on either device deleted after syncing', () => {
    const base = apply(withFeed(), [assignment('a1', 'Quiz 1', '2026-11-05'), assignment('a2', 'Lab', '2026-11-05')]);
    const phone = reducer(base, { type: 'task/delete', id: feedItemId('f1', 'a1') });
    const laptop = reducer(base, { type: 'task/delete', id: feedItemId('f1', 'a2') });
    const merged = mergeAppData(base, phone, laptop);
    expect(merged.feeds![0]!.dismissed?.sort()).toEqual(['task:a1', 'task:a2']);
  });
});

describe('feed links', () => {
  it('accepts https and webcal links only', () => {
    expect(normalizeFeedUrl(' webcal://school.instructure.com/feeds/x.ics ')).toBe('https://school.instructure.com/feeds/x.ics');
    expect(normalizeFeedUrl('http://example.com/x.ics')).toBeNull();
    expect(normalizeFeedUrl('not a link')).toBeNull();
  });

  it('names common calendars', () => {
    expect(feedName('https://asu.instructure.com/feeds/calendars/user_1.ics')).toBe('Canvas');
    expect(feedName('https://calendar.google.com/calendar/ical/x/basic.ics')).toBe('Google Calendar');
    expect(feedName('https://www.example.org/cal.ics')).toBe('example.org');
  });
});
