import { describe, expect, it, vi } from 'vitest';
import { parseIcs, type IcsEntry } from '../lib/ics';
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

  it('keeps each run deleted or kept when the link drops a different run', () => {
    const mon = lecture('mwf', '2026-11-02');
    const wed = lecture('mwf', '2026-11-04');
    const fri = lecture('mwf', '2026-11-06');
    let data = apply(withFeed(), [mon, wed, fri]);
    data = reducer(data, { type: 'event/delete', id: data.events.find((e) => e.date === '2026-11-04')!.id });
    data = apply(data, [wed, fri]);
    expect(data.events.map((e) => e.date)).toEqual(['2026-11-06']);
  });

  it("doesn't duplicate a file-imported event when one device adds the link and the other edits the event", () => {
    const party: IcsEntry = { ...lecture('p1', '2026-11-06'), title: 'Party', repeat: 'none', until: undefined };
    const imported = reducer(createEmptyData(), {
      type: 'import/add',
      tasks: [],
      events: [{ title: 'Party', date: '2026-11-06', start: 600, end: 675, repeat: 'none', allDay: false, blocksWork: true, kind: 'busy', sourceId: 'p1' }],
    });
    const laptop = apply(withFeed(imported), [party]);
    const { id, ...draft } = imported.events[0]!;
    const phone = reducer(imported, { type: 'event/update', id, draft: { ...draft, title: 'Party at Sam\'s' } });
    for (const merged of [mergeAppData(imported, laptop, phone), mergeAppData(imported, phone, laptop)]) {
      expect(merged.events).toHaveLength(1);
      expect(apply(merged, [party]).events).toHaveLength(1);
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

  it("doesn't bring back an event you moved to another day and then deleted", () => {
    const party: IcsEntry = { ...lecture('p1', '2026-11-06'), title: 'Party', repeat: 'none', until: undefined };
    let data = apply(withFeed(), [party]);
    const id = data.events[0]!.id;
    const { id: _id, ...draft } = data.events[0]!;
    data = reducer(data, { type: 'event/update', id, draft: { ...draft, date: '2026-11-07' } });
    data = reducer(data, { type: 'event/delete', id });
    expect(apply(data, [party]).events).toEqual([]);
  });

  it('keeps an item brought back with Undo after its deletion synced', () => {
    const base = apply(withFeed(), [assignment('a1', 'Quiz 1', '2026-11-05')]);
    const deleted = reducer(base, { type: 'task/delete', id: feedItemId('f1', 'a1') });
    // The deletion synced, then Undo brought the task back here while another device changed something else.
    const remote = reducer(deleted, { type: 'hours/setOverride', date: '2026-11-03', ranges: [] });
    const merged = mergeAppData(deleted, base, remote);
    expect(merged.tasks.map((t) => t.id)).toEqual([feedItemId('f1', 'a1')]);
    expect(merged.feeds![0]!.dismissed).toBeUndefined();
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

  it('leaves what a link added untied when one device removes the link and the other refreshes it', () => {
    const base = apply(withFeed(), [assignment('a1', 'Essay 2', '2026-11-06'), lecture('l1', '2026-11-03')]);
    const phone = reducer(base, { type: 'feed/remove', id: 'f1' });
    const laptop = apply(base, [assignment('a1', 'Essay 2', '2026-11-09'), lecture('l1', '2026-11-03', 660)]);
    const merged = mergeAppData(base, laptop, phone);
    expect(merged.feeds).toBeUndefined();
    expect([...merged.tasks, ...merged.events].filter((i) => 'feedId' in i || 'sourceStamp' in i || 'sourceKey' in i)).toEqual([]);
    // Adding the link again takes the items over instead of adding them twice.
    const readded = reducer(merged, { type: 'feed/add', feed: { ...FEED, id: 'f2' } });
    const again = reducer(readded, { type: 'feed/apply', id: 'f2', entries: [assignment('a1', 'Essay 2', '2026-11-09'), lecture('l1', '2026-11-03', 660)], today: TODAY, at: NOW });
    expect(again.tasks).toHaveLength(1);
    expect(again.events).toHaveLength(1);
  });

  it("doesn't bring back a one-off event you deleted when the link moves it to another date", () => {
    const talk = (date: string): IcsEntry => ({ ...lecture('t1', date), title: 'Guest talk', repeat: 'none', until: undefined });
    let data = apply(withFeed(), [talk('2026-11-05')]);
    data = reducer(data, { type: 'event/delete', id: data.events[0]!.id });
    data = apply(data, [talk('2026-11-12')]);
    expect(data.events).toEqual([]);
  });

  it('adds the runs a file import was missing when the link takes the events over', () => {
    // The file had only the Wednesday run; the link also has Monday's.
    let data = reducer(createEmptyData(), { type: 'event/add', draft: { title: 'Biology lecture', date: '2026-11-04', start: 600, end: 675, repeat: 'weekly', sourceId: 'mwf' } });
    const fileId = data.events[0]!.id;
    data = apply(withFeed(data), [lecture('mwf', '2026-11-02'), lecture('mwf', '2026-11-04')]);
    expect(data.events.map((e) => e.date).sort()).toEqual(['2026-11-02', '2026-11-04']);
    expect(data.events.find((e) => e.date === '2026-11-04')!.id).toBe(fileId);
    expect(apply(data, [lecture('mwf', '2026-11-02'), lecture('mwf', '2026-11-04')])).toBe(data);
  });

  it("doesn't duplicate a taken-over event when the link changes it on one device and it's edited on another", () => {
    const talk = (start: number): IcsEntry => ({ ...lecture('t1', '2026-11-05', start), title: 'Guest talk', repeat: 'none', until: undefined });
    let base = reducer(createEmptyData(), { type: 'event/add', draft: { title: 'Guest talk', date: '2026-11-05', start: 600, end: 675, repeat: 'none', sourceId: 't1' } });
    base = apply(withFeed(base), [talk(600)]);
    const event = base.events[0]!;
    const laptop = apply(base, [talk(660)]);
    const phone = reducer(base, { type: 'event/update', id: event.id, draft: { title: 'Guest talk (room 4)', date: event.date, start: event.start, end: event.end, repeat: 'none' } });
    expect(mergeAppData(base, laptop, phone).events).toHaveLength(1);
    expect(laptop.events[0]!.id).toBe(event.id);
  });

  it('adds a repeating event once when devices in different time zones refresh the link', () => {
    const ics = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:late-lab', 'SUMMARY:Late lab', 'DTSTART:20261106T003000Z', 'DTEND:20261106T013000Z',
      'RRULE:FREQ=WEEKLY;COUNT=4', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const readIn = (tz: string) => {
      vi.stubEnv('TZ', tz);
      try {
        return parseIcs(ics, new Date('2026-11-02T16:00:00Z'));
      } finally {
        vi.unstubAllEnvs();
      }
    };
    const [utc, la] = [readIn('UTC'), readIn('America/Los_Angeles')];
    expect(utc[0]!.date).not.toBe(la[0]!.date);
    const base = withFeed();
    const laptop = apply(base, utc);
    const phone = apply(base, la);
    expect(mergeAppData(base, laptop, phone).events).toHaveLength(1);
    // Deleting it on one device keeps the other device's copy from coming back.
    const deleted = reducer(laptop, { type: 'event/delete', id: laptop.events[0]!.id });
    expect(apply(mergeAppData(base, deleted, phone), la).events).toEqual([]);
  });

  it("keeps your edits to a repeating event when only the link's look-ahead grows", () => {
    const ics = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:standup', 'SUMMARY:Standup', 'DTSTART;TZID=America/New_York:20261102T100000',
      'DTEND;TZID=America/New_York:20261102T103000', 'RRULE:FREQ=WEEKLY', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const readOn = (day: string) => {
      vi.stubEnv('TZ', 'UTC');
      try {
        return parseIcs(ics, new Date(`${day}T12:00:00Z`));
      } finally {
        vi.unstubAllEnvs();
      }
    };
    const [early, later] = [readOn('2026-11-01'), readOn('2026-11-15')];
    expect(later.length).toBeGreaterThan(early.length);
    let data = apply(withFeed(), early, '2026-11-01');
    const edited = data.events[0]!;
    data = reducer(data, { type: 'event/update', id: edited.id, draft: { ...edited, title: 'Team standup' } });
    data = apply(data, later, '2026-11-15');
    expect(data.events.find((e) => e.id === edited.id)!.title).toBe('Team standup');
    expect(data.events.filter((e) => e.title === 'Standup').length).toBe(later.length - 1);
  });

  it("updates only what the link changed about an event, keeping your edits", () => {
    let data = apply(withFeed(), [lecture('l1', '2026-11-03')]);
    const id = data.events[0]!.id;
    data = reducer(data, { type: 'event/update', id, draft: { ...data.events[0]!, title: 'Bio (room 210)' } });
    data = apply(data, [lecture('l1', '2026-11-03', 660)]);
    expect(data.events).toMatchObject([{ id, title: 'Bio (room 210)', start: 660, end: 735 }]);
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
