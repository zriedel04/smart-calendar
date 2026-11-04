import { describe, expect, it } from 'vitest';
import { createEmptyData, hasUserData } from './defaults';
import { reducer } from './reducer';
import { parseAppData } from './storage';

const draft = { title: 'Essay', dueDate: '2026-11-10', estimateMinutes: 120 };

describe('reducer', () => {
  it('adds, edits and deletes tasks along with their logged time', () => {
    let state = reducer(createEmptyData(), { type: 'task/add', draft });
    const id = state.tasks[0]!.id;

    state = reducer(state, { type: 'task/update', id, draft: { ...draft, title: 'Final essay' } });
    expect(state.tasks[0]).toMatchObject({ title: 'Final essay', estimateMinutes: 120 });

    state = reducer(state, { type: 'work/log', taskId: id, date: '2026-11-03', minutes: 60 });
    expect(state.logs).toHaveLength(1);

    state = reducer(state, { type: 'task/delete', id });
    expect(state.tasks).toEqual([]);
    expect(state.logs).toEqual([]);
  });

  it('pushes a task off until a date and brings it back, and saves the date', () => {
    let state = reducer(createEmptyData(), { type: 'task/add', draft });
    const id = state.tasks[0]!.id;
    state = reducer(state, { type: 'task/push', id, until: '2026-11-04' });
    expect(state.tasks[0]?.notBefore).toBe('2026-11-04');
    expect(parseAppData(JSON.stringify(state)).tasks[0]?.notBefore).toBe('2026-11-04');
    state = reducer(state, { type: 'task/unpush', id });
    expect(state.tasks[0]).not.toHaveProperty('notBefore');
  });

  it("undoes a day's ticked work for a task", () => {
    let state = reducer(createEmptyData(), { type: 'task/add', draft });
    const id = state.tasks[0]!.id;
    state = reducer(state, { type: 'work/log', taskId: id, date: '2026-11-02', minutes: 30 });
    state = reducer(state, { type: 'work/log', taskId: id, date: '2026-11-03', minutes: 60 });
    state = reducer(state, { type: 'work/undoDay', taskId: id, date: '2026-11-03' });
    expect(state.logs.map((l) => l.date)).toEqual(['2026-11-02']);
  });

  it('sets and clears a one-day change to working hours', () => {
    const ranges = [{ start: 720, end: 960 }];
    let state = reducer(createEmptyData(), { type: 'hours/setOverride', date: '2026-11-09', ranges });
    expect(state.overrides).toEqual({ '2026-11-09': ranges });
    state = reducer(state, { type: 'hours/clearOverride', date: '2026-11-09' });
    expect(state.overrides).toEqual({});
  });

  it('updates the default hours for one weekday only', () => {
    const ranges = [{ start: 540, end: 720 }];
    const state = reducer(createEmptyData(), { type: 'hours/setWeekday', weekday: 6, ranges });
    expect(state.weeklyHours[6]).toEqual(ranges);
    expect(state.weeklyHours[1]).toEqual(createEmptyData().weeklyHours[1]);
  });
});

describe('parseAppData', () => {
  it('round-trips saved data', () => {
    const state = reducer(createEmptyData(), { type: 'task/add', draft });
    expect(parseAppData(JSON.stringify(state))).toEqual(state);
  });

  it('drops malformed entries instead of crashing', () => {
    const parsed = parseAppData(
      JSON.stringify({
        version: 1,
        tasks: [{ id: 'x', title: 'Bad date', dueDate: 'soon', estimateMinutes: 60, createdAt: '' }],
        logs: [{ id: 'l', taskId: 'missing', date: '2026-11-03', minutes: 30 }],
        weeklyHours: 'nope',
        overrides: { 'not-a-date': [], '2026-11-09': [{ start: 720, end: 600 }] },
        events: [],
      }),
    );
    expect(parsed.tasks).toEqual([]);
    expect(parsed.logs).toEqual([]);
    expect(parsed.weeklyHours).toEqual(createEmptyData().weeklyHours);
    expect(parsed.overrides).toEqual({ '2026-11-09': [] });
  });

  it('rejects files that are not app data', () => {
    expect(() => parseAppData('{"hello": "world"}')).toThrow(/not Smart Calendar data/);
  });
});

describe('hasUserData', () => {
  it('counts changed hours, overrides and events as user data, not just tasks', () => {
    const empty = createEmptyData();
    expect(hasUserData(empty)).toBe(false);
    expect(hasUserData(reducer(empty, { type: 'hours/setWeekday', weekday: 6, ranges: [{ start: 540, end: 720 }] }))).toBe(true);
    expect(hasUserData(reducer(empty, { type: 'hours/setOverride', date: '2026-11-09', ranges: [] }))).toBe(true);
    expect(
      hasUserData(
        reducer(empty, {
          type: 'event/add',
          draft: { title: 'Class', date: '2026-11-03', start: 840, end: 900, repeat: 'weekly' },
        }),
      ),
    ).toBe(true);
  });
});
