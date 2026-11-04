import { describe, expect, it } from 'vitest';
import { addDays, weekdayOf, type ISODate } from './dates';
import { buildSchedule, type SchedulableTask } from './scheduler';

const TODAY = '2026-11-03'; // a Tuesday
const h = (hours: number) => hours * 60;

const task = (id: string, dueInDays: number, hours: number): SchedulableTask => ({
  id,
  dueDate: addDays(TODAY, dueInDays),
  remainingMinutes: h(hours),
});

const every = (minutes: number) => () => minutes;

/** Compact view of the plan: { date: ['taskId:minutes', ...] } for days with work. */
function summarize(schedule: ReturnType<typeof buildSchedule>): Record<ISODate, string[]> {
  const out: Record<ISODate, string[]> = {};
  for (const day of schedule.days) {
    if (day.items.length) out[day.date] = day.items.map((i) => `${i.taskId}:${i.minutes}`);
  }
  return out;
}

describe('buildSchedule', () => {
  it('plans no work on a task after its lastDate and leaves the rest unscheduled', () => {
    const schedule = buildSchedule({
      today: TODAY,
      tasks: [{ ...task('study', 0, 4), lastDate: TODAY }, task('lab', 3, 2)],
      capacityOn: every(h(3)),
    });
    expect(summarize(schedule)).toEqual({ [TODAY]: ['study:180'], [addDays(TODAY, 1)]: ['lab:120'] });
    expect(schedule.forecasts.get('study')).toMatchObject({ unscheduledMinutes: 60, atRisk: true });
  });

  it('plans no work on a task before its notBefore date, giving the time to other tasks', () => {
    const schedule = buildSchedule({
      today: TODAY,
      tasks: [{ ...task('essay', 2, 3), notBefore: addDays(TODAY, 1) }, task('lab', 5, 3)],
      capacityOn: every(h(3)),
    });
    expect(summarize(schedule)).toEqual({ [TODAY]: ['lab:180'], [addDays(TODAY, 1)]: ['essay:180'] });
  });

  it('fills a free day with work that is due later, so you stay ahead', () => {
    // Nothing is due for a week, but there are 6 hours free today.
    const schedule = buildSchedule({
      today: TODAY,
      tasks: [task('essay', 7, 4), task('lab', 7, 3), task('reading', 8, 2)],
      capacityOn: every(h(6)),
    });

    const today = schedule.dayPlan(TODAY);
    expect(today.planned).toBe(h(6));
    expect(today.items.map((i) => i.taskId)).toEqual(['lab', 'essay']);
  });

  it('works in due-date order and splits big tasks across days', () => {
    const schedule = buildSchedule({
      today: TODAY,
      tasks: [task('later', 5, 3), task('soon', 1, 8)],
      capacityOn: every(h(6)),
    });

    expect(summarize(schedule)).toEqual({
      '2026-11-03': ['soon:360'],
      '2026-11-04': ['soon:120', 'later:180'],
    });
    expect(schedule.forecasts.get('soon')).toMatchObject({ finishDate: '2026-11-04', atRisk: false });
  });

  it('breaks ties by doing the smaller task first', () => {
    const schedule = buildSchedule({
      today: TODAY,
      tasks: [task('big', 3, 5), task('small', 3, 1)],
      capacityOn: every(h(2)),
    });
    expect(schedule.dayPlan(TODAY).items.map((i) => i.taskId)).toEqual(['small', 'big']);
  });

  it('skips days with no hours, like weekends', () => {
    const weekdaysOnly = (date: ISODate) => ([0, 6].includes(weekdayOf(date)) ? 0 : h(6));
    const schedule = buildSchedule({
      today: '2026-11-06', // Friday
      tasks: [{ id: 'project', dueDate: '2026-11-12', remainingMinutes: h(10) }],
      capacityOn: weekdaysOnly,
    });
    expect(summarize(schedule)).toEqual({
      '2026-11-06': ['project:360'],
      '2026-11-09': ['project:240'],
    });
  });

  it('re-plans when hours change: fewer hours today pushes work to tomorrow', () => {
    const tasks = [task('a', 3, 5), task('b', 4, 3)];
    const normal = buildSchedule({ today: TODAY, tasks, capacityOn: every(h(6)) });
    const shortDay = buildSchedule({
      today: TODAY,
      tasks,
      capacityOn: (date) => (date === TODAY ? h(4) : h(6)),
    });

    expect(normal.dayPlan(TODAY).planned).toBe(h(6));
    expect(shortDay.dayPlan(TODAY).planned).toBe(h(4));
    expect(summarize(shortDay)['2026-11-04']).toEqual(['a:60', 'b:180']);
  });

  it("doesn't schedule a tiny slice of a big task, but lets a small task fill the gap", () => {
    const schedule = buildSchedule({
      today: TODAY,
      tasks: [
        { id: 'first', dueDate: '2026-11-04', remainingMinutes: 110 },
        { id: 'big', dueDate: '2026-11-05', remainingMinutes: h(3) },
        { id: 'quick', dueDate: '2026-11-06', remainingMinutes: 10 },
      ],
      capacityOn: every(h(2)),
    });
    // 10 minutes are left after "first"; "big" would only get a 10-minute sliver, so "quick" goes there.
    expect(schedule.dayPlan(TODAY).items.map((i) => `${i.taskId}:${i.minutes}`)).toEqual([
      'first:110',
      'quick:10',
    ]);
  });

  it('flags tasks that cannot be finished before they are due', () => {
    const schedule = buildSchedule({
      today: TODAY,
      tasks: [task('tooBig', 1, 20), task('fine', 30, 1)],
      capacityOn: every(h(6)),
    });
    expect(schedule.forecasts.get('tooBig')).toMatchObject({ atRisk: true, finishDate: '2026-11-06' });
    expect(schedule.forecasts.get('fine')).toMatchObject({ atRisk: false });
  });

  it('puts overdue work first and flags it', () => {
    const schedule = buildSchedule({
      today: TODAY,
      tasks: [task('next', 2, 1), task('missed', -1, 1)],
      capacityOn: every(h(6)),
    });
    expect(schedule.dayPlan(TODAY).items.map((i) => i.taskId)).toEqual(['missed', 'next']);
    expect(schedule.forecasts.get('missed')?.atRisk).toBe(true);
  });

  it('reports work it could not place when no hours are set', () => {
    const schedule = buildSchedule({
      today: TODAY,
      tasks: [task('stuck', 3, 2)],
      capacityOn: every(0),
      horizonDays: 30,
    });
    expect(schedule.days.every((d) => d.items.length === 0)).toBe(true);
    expect(schedule.forecasts.get('stuck')).toEqual({
      taskId: 'stuck',
      finishDate: null,
      unscheduledMinutes: h(2),
      atRisk: true,
    });
  });

  it('ignores finished tasks and returns an empty plan for unscheduled dates', () => {
    const schedule = buildSchedule({
      today: TODAY,
      tasks: [{ id: 'done', dueDate: TODAY, remainingMinutes: 0 }],
      capacityOn: every(h(6)),
    });
    expect(schedule.days).toEqual([]);
    expect(schedule.dayPlan('2026-12-01')).toEqual({
      date: '2026-12-01',
      capacity: 0,
      planned: 0,
      items: [],
    });
  });

  it('never plans more than the hours available on any day', () => {
    const tasks = Array.from({ length: 25 }, (_, i) => task(`t${i}`, i % 9, (i % 5) + 0.5));
    const capacity = (date: ISODate) => (weekdayOf(date) * 47) % 400;
    const schedule = buildSchedule({ today: TODAY, tasks, capacityOn: capacity });

    for (const day of schedule.days) {
      const planned = day.items.reduce((sum, i) => sum + i.minutes, 0);
      expect(planned).toBe(day.planned);
      expect(planned).toBeLessThanOrEqual(capacity(day.date));
    }
    const scheduledTotal = schedule.days.flatMap((d) => d.items).reduce((s, i) => s + i.minutes, 0);
    const requested = tasks.reduce((s, t) => s + t.remainingMinutes, 0);
    expect(scheduledTotal).toBe(requested);
  });
});
