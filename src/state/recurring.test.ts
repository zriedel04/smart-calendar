import { describe, expect, it } from 'vitest';
import { createEmptyData } from './defaults';
import { fillSeries, nextSeriesDate, seriesRepeatLabel, WEEKDAYS } from './recurring';
import { reducer, type SeriesDraft } from './reducer';
import { parseAppData } from './storage';
import type { AppData } from './types';

const MONDAY = '2026-11-02';
const study: SeriesDraft = { title: 'Study', estimateMinutes: 60, days: WEEKDAYS, startDate: MONDAY };

const add = (draft: SeriesDraft = study, today = MONDAY) =>
  reducer(createEmptyData(), { type: 'series/add', draft, today });
const dates = (data: AppData) => data.tasks.map((t) => t.dueDate).sort();

describe('repeating tasks', () => {
  it('makes a copy for each matching day in the next week, planned on its own day', () => {
    const data = add();
    expect(dates(data)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']);
    expect(data.tasks[1]).toMatchObject({ title: 'Study', estimateMinutes: 60, notBefore: '2026-11-03', seriesId: data.series![0]!.id });
  });

  it('adds new days as time passes, without bringing back a day you skipped', () => {
    let data = add();
    data = reducer(data, { type: 'task/delete', id: data.tasks.find((t) => t.dueDate === '2026-11-03')!.id });
    data = fillSeries(data, '2026-11-03');
    expect(dates(data)).toEqual(['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09']);
    expect(fillSeries(data, '2026-11-03')).toBe(data);
  });

  it("clears a missed day, but keeps one you logged time on as finished", () => {
    let data = add();
    const tuesday = data.tasks.find((t) => t.dueDate === '2026-11-03')!;
    data = reducer(data, { type: 'work/log', taskId: tuesday.id, date: '2026-11-03', minutes: 20 });
    data = fillSeries(data, '2026-11-04');
    expect(data.tasks.some((t) => t.dueDate === '2026-11-02')).toBe(false);
    expect(data.tasks.find((t) => t.id === tuesday.id)?.completedAt).toBeDefined();
  });

  it("keeps a day whose timer is still running past midnight, so stopping it logs the time", () => {
    let data = add();
    const monday = data.tasks.find((t) => t.dueDate === MONDAY)!;
    data = reducer(data, { type: 'timer/start', taskId: monday.id, at: '2026-11-03T06:30:00.000Z', date: MONDAY });
    data = fillSeries(data, '2026-11-03');
    expect(data.tasks.some((t) => t.id === monday.id)).toBe(true);
    expect(data.timer?.taskId).toBe(monday.id);
    data = reducer(data, { type: 'timer/stop', at: '2026-11-03T07:30:00.000Z', date: '2026-11-03' });
    expect(data.logs).toMatchObject([{ taskId: monday.id, minutes: 60 }]);
  });

  it('skips a day, keeping it as finished if you logged time on it', () => {
    let data = add();
    const [monday, tuesday] = data.tasks;
    data = reducer(data, { type: 'work/log', taskId: monday!.id, date: MONDAY, minutes: 20 });
    data = reducer(data, { type: 'task/skip', id: monday!.id });
    data = reducer(data, { type: 'task/skip', id: tuesday!.id });
    expect(data.tasks.find((t) => t.id === monday!.id)?.completedAt).toBeDefined();
    expect(data.logs).toHaveLength(1);
    expect(data.tasks.some((t) => t.id === tuesday!.id)).toBe(false);
  });

  it('keeps a skipped day skipped after the series is edited, and forgets it once it passes', () => {
    let data = add();
    const id = data.series![0]!.id;
    data = reducer(data, { type: 'task/skip', id: data.tasks.find((t) => t.dueDate === MONDAY)!.id });
    data = reducer(data, { type: 'series/update', id, draft: { ...study, title: 'Study Spanish' }, today: MONDAY });
    expect(dates(data)).toEqual(['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']);
    expect(fillSeries(data, '2026-11-03').series![0]!.skipped).toBeUndefined();
  });

  it('stops at its last day', () => {
    expect(dates(add({ ...study, until: '2026-11-03' }))).toEqual(['2026-11-02', '2026-11-03']);
  });

  it('remakes upcoming days after an edit, keeping a day you started', () => {
    let data = add();
    const id = data.series![0]!.id;
    const monday = data.tasks.find((t) => t.dueDate === MONDAY)!;
    data = reducer(data, { type: 'work/log', taskId: monday.id, date: MONDAY, minutes: 15 });
    data = reducer(data, { type: 'series/update', id, draft: { ...study, title: 'Review notes', days: [1, 3] }, today: MONDAY });
    expect(data.tasks.map((t) => [t.dueDate, t.title]).sort()).toEqual([
      ['2026-11-02', 'Study'],
      ['2026-11-04', 'Review notes'],
    ]);
  });

  it('makes no copies before a first day moved later', () => {
    let data = add();
    const id = data.series![0]!.id;
    data = reducer(data, { type: 'series/update', id, draft: { ...study, startDate: '2026-11-05' }, today: MONDAY });
    expect(dates(data)).toEqual(['2026-11-05', '2026-11-06']);
  });

  it('finds the next day without a copy yet', () => {
    const later = add({ ...study, startDate: '2026-12-01' });
    expect(later.tasks).toEqual([]);
    expect(nextSeriesDate(later.series![0]!, MONDAY)).toBe('2026-12-01');
    expect(nextSeriesDate(add().series![0]!, MONDAY)).toBe('2026-11-09');
    expect(nextSeriesDate(add({ ...study, until: '2026-11-06' }).series![0]!, MONDAY)).toBeNull();
  });

  it('stops repeating, removing upcoming days you have not started', () => {
    let data = add();
    data = reducer(data, { type: 'series/stop', id: data.series![0]!.id, today: '2026-11-03' });
    expect(data.series).toEqual([]);
    expect(dates(data)).toEqual(['2026-11-02']);
  });

  it('saves and loads repeating tasks', () => {
    const data = add();
    const loaded = parseAppData(JSON.stringify(data));
    expect(loaded.series).toEqual(data.series);
    expect(loaded.tasks[0]?.seriesId).toBe(data.series![0]!.id);
  });

  it('describes how often it repeats', () => {
    expect(seriesRepeatLabel([0, 1, 2, 3, 4, 5, 6])).toBe('Every day');
    expect(seriesRepeatLabel(WEEKDAYS)).toBe('Every weekday');
    expect(seriesRepeatLabel([0])).toBe('Every Sunday');
    expect(seriesRepeatLabel([5, 1, 3])).toBe('Every Mon, Wed, Fri');
  });
});
