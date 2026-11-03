import { describe, expect, it } from 'vitest';
import type { IcsEntry } from '../lib/ics';
import { planImport, toEventDrafts } from './calendarImport';
import { createEmptyData } from './defaults';

const entry = (partial: Partial<IcsEntry>): IcsEntry => ({
  uid: 'u1',
  title: 'Thing',
  date: '2026-11-10',
  endDate: '2026-11-10',
  allDay: false,
  start: 600,
  end: 660,
  repeat: 'none',
  looksLikeAssignment: false,
  ...partial,
});

describe('calendar import', () => {
  it('keeps weekly classes that started in the past but are still running', () => {
    const [row] = planImport([entry({ date: '2026-08-24', repeat: 'weekly', until: '2026-12-11' })], createEmptyData(), '2026-11-02');
    expect(row?.as).toBe('event');
    const [ended] = planImport([entry({ date: '2026-01-05', repeat: 'weekly', until: '2026-05-01' })], createEmptyData(), '2026-11-02');
    expect(ended).toMatchObject({ as: 'skip', skipReason: 'past' });
  });

  it('copies a multi-day all-day entry onto each day, and spots birthdays', () => {
    const trip = toEventDrafts(entry({ allDay: true, date: '2026-12-19', endDate: '2026-12-21', title: 'Ski trip' }));
    expect(trip.map((e) => e.date)).toEqual(['2026-12-19', '2026-12-20', '2026-12-21']);
    expect(trip[0]).toMatchObject({ allDay: true, blocksWork: false, kind: 'other' });
    const [bday] = toEventDrafts(entry({ allDay: true, title: "Sam's Birthday", repeat: 'yearly' }));
    expect(bday?.kind).toBe('birthday');
  });

  it('gives a timed entry with no length an hour so it shows up', () => {
    const [e] = toEventDrafts(entry({ start: 600, end: 600 }));
    expect(e).toMatchObject({ start: 600, end: 660, blocksWork: true });
  });

  it('repeats every day of a multi-day yearly entry', () => {
    const trip = toEventDrafts(
      entry({ allDay: true, date: '2026-12-19', endDate: '2026-12-21', repeat: 'yearly', until: '2028-12-19' }),
    );
    expect(trip.map((e) => [e.date, e.repeat, e.until])).toEqual([
      ['2026-12-19', 'yearly', '2028-12-19'],
      ['2026-12-20', 'yearly', '2028-12-20'],
      ['2026-12-21', 'yearly', '2028-12-21'],
    ]);
  });
});
