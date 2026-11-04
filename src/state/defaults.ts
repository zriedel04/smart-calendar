import { addDays, type ISODate } from '../lib/dates';
import type { TimeRange } from '../lib/time';
import { createId } from './ids';
import type { AppData } from './types';

const NOON_TO_SIX: TimeRange[] = [{ start: 12 * 60, end: 18 * 60 }];

/** Starting point for a new user: weekdays 12pm to 6pm, weekends off. */
export function createEmptyData(): AppData {
  return {
    version: 1,
    tasks: [],
    logs: [],
    weeklyHours: [[], NOON_TO_SIX, NOON_TO_SIX, NOON_TO_SIX, NOON_TO_SIX, NOON_TO_SIX, []],
    overrides: {},
    events: [],
  };
}

/** A realistic week of work, relative to `today`, so the demo has something to show. */
export function createSampleData(today: ISODate): AppData {
  const now = new Date().toISOString();
  const task = (title: string, dueInDays: number, hours: number, notes?: string) => ({
    id: createId(),
    title,
    dueDate: addDays(today, dueInDays),
    estimateMinutes: Math.round(hours * 60),
    notes,
    createdAt: now,
  });

  return {
    ...createEmptyData(),
    tasks: [
      task('Reply to internship recruiter', 0, 0.5),
      task('Algorithms problem set 6', 2, 3, 'Dynamic programming, problems 1 to 8'),
      task('Database systems lab report', 4, 4),
      task('Read chapters 9 and 10 for history', 6, 2.5),
      task('Portfolio site: projects page', 9, 5),
      task('Study for networking midterm', 13, 8),
    ],
    events: [
      {
        id: createId(),
        title: 'Team standup',
        date: today,
        start: 13 * 60,
        end: 13 * 60 + 30,
        repeat: 'weekly',
      },
      {
        id: createId(),
        title: "Alex's birthday",
        date: addDays(today, 4),
        start: 0,
        end: 24 * 60,
        repeat: 'yearly',
        kind: 'birthday',
        allDay: true,
        blocksWork: false,
      },
      {
        id: createId(),
        title: 'Dinner with friends',
        date: addDays(today, 2),
        start: 18 * 60 + 30,
        end: 20 * 60 + 30,
        repeat: 'none',
        kind: 'plan',
      },
    ],
  };
}

/** True if `data` holds anything the user entered: tasks, logged time, events, or changed hours. */
export function hasUserData(data: AppData): boolean {
  const empty = createEmptyData();
  return (
    data.tasks.length > 0 ||
    data.logs.length > 0 ||
    data.events.length > 0 ||
    Object.keys(data.overrides).length > 0 ||
    JSON.stringify(data.weeklyHours) !== JSON.stringify(empty.weeklyHours)
  );
}
