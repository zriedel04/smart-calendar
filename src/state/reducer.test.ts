import { describe, expect, it } from 'vitest';
import { createEmptyData, hasUserData } from './defaults';
import { planFor } from './planner';
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

  it('plans a task on a chosen day, clears it, and drops it when the task is pushed', () => {
    let state = reducer(createEmptyData(), { type: 'task/add', draft });
    const id = state.tasks[0]!.id;
    state = reducer(state, { type: 'task/plan', id, date: '2026-11-05' });
    expect(state.tasks[0]?.planDate).toBe('2026-11-05');
    expect(parseAppData(JSON.stringify(state)).tasks[0]?.planDate).toBe('2026-11-05');
    state = reducer(state, { type: 'task/plan', id, date: null });
    expect(state.tasks[0]).not.toHaveProperty('planDate');
    state = reducer(state, { type: 'task/plan', id, date: '2026-11-03' });
    state = reducer(state, { type: 'task/push', id, until: '2026-11-04' });
    expect(state.tasks[0]).not.toHaveProperty('planDate');
    expect(state.tasks[0]?.notBefore).toBe('2026-11-04');
  });

  it('lets a chosen day replace a push, by dragging or from the form', () => {
    let state = reducer(createEmptyData(), { type: 'task/add', draft });
    const id = state.tasks[0]!.id;
    state = reducer(state, { type: 'task/push', id, until: '2026-11-04' });
    state = reducer(state, { type: 'task/plan', id, date: '2026-11-03' });
    expect(state.tasks[0]).toMatchObject({ planDate: '2026-11-03' });
    expect(state.tasks[0]).not.toHaveProperty('notBefore');
    expect(planFor(state, '2026-11-03').dayPlan('2026-11-03').items.map((i) => i.taskId)).toEqual([id]);

    state = reducer(state, { type: 'task/push', id, until: '2026-11-04' });
    state = reducer(state, { type: 'task/update', id, draft: { ...draft, planDate: '2026-11-03' } });
    expect(state.tasks[0]).not.toHaveProperty('notBefore');
    state = reducer(state, { type: 'task/push', id, until: '2026-11-04' });
    state = reducer(state, { type: 'task/update', id, draft: { ...draft, planDate: undefined } });
    expect(state.tasks[0]?.notBefore).toBe('2026-11-04');
  });

  it("doesn't move a repeating task's copy off its own day", () => {
    let state = reducer(createEmptyData(), { type: 'task/add', draft });
    state = { ...state, tasks: state.tasks.map((t) => ({ ...t, seriesId: 's1' })) };
    const id = state.tasks[0]!.id;
    expect(reducer(state, { type: 'task/plan', id, date: '2026-11-05' }).tasks[0]).not.toHaveProperty('planDate');
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

  describe('timer', () => {
    const at = (minutes: number, seconds = 0) => new Date(Date.UTC(2026, 10, 2, 19, minutes, seconds)).toISOString();
    const withTwoTasks = () => {
      let state = reducer(createEmptyData(), { type: 'task/add', draft });
      state = reducer(state, { type: 'task/add', draft: { ...draft, title: 'Lab' } });
      return { state, essay: state.tasks[0]!.id, lab: state.tasks[1]!.id };
    };

    it('logs whole minutes when stopped, and nothing for under a minute', () => {
      let { state, essay } = withTwoTasks();
      state = reducer(state, { type: 'timer/start', taskId: essay, at: at(0), date: '2026-11-02' });
      expect(parseAppData(JSON.stringify(state)).timer).toEqual({ taskId: essay, startedAt: at(0) });
      state = reducer(state, { type: 'timer/stop', at: at(25, 50), date: '2026-11-02' });
      expect(state).not.toHaveProperty('timer');
      expect(state.logs).toMatchObject([{ taskId: essay, date: '2026-11-02', minutes: 25 }]);

      state = reducer(state, { type: 'timer/start', taskId: essay, at: at(30), date: '2026-11-02' });
      state = reducer(state, { type: 'timer/stop', at: at(30, 59), date: '2026-11-02' });
      expect(state.logs).toHaveLength(1);
      expect(state).not.toHaveProperty('timer');
    });

    it('logs the running timer when you start one on another task', () => {
      let { state, essay, lab } = withTwoTasks();
      state = reducer(state, { type: 'timer/start', taskId: essay, at: at(0), date: '2026-11-02' });
      expect(reducer(state, { type: 'timer/start', taskId: essay, at: at(5), date: '2026-11-02' })).toBe(state);
      state = reducer(state, { type: 'timer/start', taskId: lab, at: at(10), date: '2026-11-02' });
      expect(state.logs).toMatchObject([{ taskId: essay, minutes: 10 }]);
      expect(state.timer).toEqual({ taskId: lab, startedAt: at(10) });
    });

    it('cancels without logging, and stops when the task is ticked, finished, deleted or skipped', () => {
      let { state, essay } = withTwoTasks();
      const start = (s: typeof state) => reducer(s, { type: 'timer/start', taskId: essay, at: at(0), date: '2026-11-02' });
      state = reducer(start(state), { type: 'timer/cancel' });
      expect(state).not.toHaveProperty('timer');
      expect(state.logs).toHaveLength(0);

      expect(reducer(start(state), { type: 'work/log', taskId: essay, date: '2026-11-02', minutes: 120 })).not.toHaveProperty('timer');
      expect(reducer(start(state), { type: 'task/setComplete', id: essay, complete: true })).not.toHaveProperty('timer');
      expect(reducer(start(state), { type: 'task/delete', id: essay })).not.toHaveProperty('timer');
      const copy = { ...state, tasks: state.tasks.map((t) => (t.id === essay ? { ...t, seriesId: 's1' } : t)) };
      expect(reducer(start(copy), { type: 'task/skip', id: essay })).not.toHaveProperty('timer');
      // A copy you logged time on is kept as finished when skipped, and its timer still stops.
      const started = reducer(copy, { type: 'work/log', taskId: essay, date: '2026-11-02', minutes: 10 });
      const skipped = reducer(start(started), { type: 'task/skip', id: essay });
      expect(skipped.tasks.find((t) => t.id === essay)?.completedAt).toBeDefined();
      expect(skipped).not.toHaveProperty('timer');
    });

    it("doesn't load a timer for a task that isn't there", () => {
      const { state } = withTwoTasks();
      const saved = { ...state, timer: { taskId: 'gone', startedAt: at(0) } };
      expect(parseAppData(JSON.stringify(saved))).not.toHaveProperty('timer');
      const garbled = { ...state, timer: { taskId: state.tasks[0]!.id, startedAt: 'soon' } };
      expect(parseAppData(JSON.stringify(garbled))).not.toHaveProperty('timer');
    });
  });
});
