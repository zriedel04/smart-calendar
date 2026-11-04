import { describe, expect, it } from 'vitest';
import { createEmptyData } from './defaults';
import { reducer } from './reducer';
import { storeReducer, type StoreState } from './undo';

const draft = { title: 'Essay', dueDate: '2026-11-10', estimateMinutes: 120 };

describe('storeReducer', () => {
  it('turns a task into a repeating one in a single step, with no Undo that could leave both', () => {
    const data = reducer(createEmptyData(), { type: 'task/add', draft });
    const id = data.tasks[0]!.id;
    const state = storeReducer(
      { data, undo: null },
      { type: 'series/add', draft: { ...draft, days: [1], startDate: '2026-11-02' }, today: '2026-11-02', replacesTaskId: id },
    );
    expect(state.data.tasks.some((t) => t.id === id)).toBe(false);
    expect(state.data.series).toHaveLength(1);
    expect(state.undo).toBeNull();
  });

  it('offers to undo a tick, keeps the offer through a repeating-task refresh, and drops it on the next edit', () => {
    const data = reducer(createEmptyData(), { type: 'task/add', draft });
    const id = data.tasks[0]!.id;
    let state: StoreState = { data, undo: null };

    state = storeReducer(state, { type: 'work/log', taskId: id, date: '2026-11-02', minutes: 60 });
    expect(state.undo?.label).toBe('Logged 1h on "Essay"');

    state = storeReducer(state, { type: 'series/add', draft: { ...draft, days: [1], startDate: '2026-11-02' }, today: '2026-11-02' });
    expect(state.undo).toBeNull();

    state = storeReducer(state, { type: 'task/delete', id });
    state = storeReducer(state, { type: 'series/fill', today: '2026-11-09' });
    expect(state.undo?.label).toBe('Deleted "Essay"');

    state = storeReducer(state, { type: 'undo' });
    expect(state.data.tasks.some((t) => t.id === id)).toBe(true);
    expect(state.undo).toBeNull();
  });
});
