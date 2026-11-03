import { describe, expect, it } from 'vitest';
import { createEmptyData } from './defaults';
import { planFor } from './planner';
import type { AppData, Task } from './types';

const TODAY = '2026-11-03'; // Tuesday, default hours 12pm to 6pm
const h = (hours: number) => hours * 60;

const task = (id: string, dueDate: string, hours: number, extra: Partial<Task> = {}): Task => ({
  id,
  title: id,
  dueDate,
  estimateMinutes: h(hours),
  createdAt: '2026-11-01T00:00:00.000Z',
  ...extra,
});

const data = (partial: Partial<AppData>): AppData => ({ ...createEmptyData(), ...partial });

const todayItems = (d: AppData) =>
  planFor(d, TODAY)
    .dayPlan(TODAY)
    .items.map((i) => `${i.taskId}:${i.minutes}`);

describe('planFor', () => {
  it("keeps the rest of today's list the same after you tick something off", () => {
    const base = data({ tasks: [task('a', '2026-11-05', 2), task('b', '2026-11-06', 3), task('c', '2026-11-09', 5)] });
    expect(todayItems(base)).toEqual(['a:120', 'b:180', 'c:60']);

    const afterTick = { ...base, logs: [{ id: 'l1', taskId: 'b', date: TODAY, minutes: h(3) }] };
    expect(todayItems(afterTick)).toEqual(['a:120', 'c:60']);
    expect(planFor(afterTick, TODAY).doneToday).toBe(h(3));
  });

  it('reschedules work you did not get to on an earlier day', () => {
    // Yesterday's plan isn't stored: whatever wasn't logged is simply still left to do.
    const d = data({
      tasks: [task('essay', '2026-11-06', 5)],
      logs: [{ id: 'l1', taskId: 'essay', date: '2026-11-02', minutes: h(2) }],
    });
    expect(todayItems(d)).toEqual(['essay:180']);
  });

  it('leaves out tasks you marked complete or fully logged', () => {
    const d = data({
      tasks: [
        task('marked', '2026-11-05', 4, { completedAt: '2026-11-02T10:00:00.000Z' }),
        task('logged', '2026-11-05', 1),
        task('open', '2026-11-05', 1),
      ],
      logs: [{ id: 'l1', taskId: 'logged', date: '2026-11-02', minutes: h(1) }],
    });
    expect(todayItems(d)).toEqual(['open:60']);
  });

  it('updates the list when today has an override and when events block time', () => {
    const tasks = [task('a', '2026-11-20', 10)];
    expect(todayItems(data({ tasks }))).toEqual(['a:360']);
    expect(todayItems(data({ tasks, overrides: { [TODAY]: [{ start: h(12), end: h(16) }] } }))).toEqual(['a:240']);
    expect(
      todayItems(
        data({
          tasks,
          events: [{ id: 'e', title: 'Class', date: '2026-10-27', start: h(14), end: h(15), repeat: 'weekly' }],
        }),
      ),
    ).toEqual(['a:300']);
  });
});
