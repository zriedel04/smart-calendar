import { describe, expect, it } from 'vitest';
import { parseQuickTask } from './quickAdd';

// Monday, November 23, 2026.
const TODAY = '2026-11-23';
const parse = (text: string) => parseQuickTask(text, TODAY);

describe('parseQuickTask', () => {
  it('reads a weekday and hours', () => {
    expect(parse('Essay due Fri 3h')).toEqual({ title: 'Essay', dueDate: '2026-11-27', estimateMinutes: 180 });
    expect(parse('History reading friday 1.5 hours')).toEqual({ title: 'History reading', dueDate: '2026-11-27', estimateMinutes: 90 });
  });

  it('reads today, tomorrow, next week and in N days', () => {
    expect(parse('Reply to email today 15 min')).toEqual({ title: 'Reply to email', dueDate: TODAY, estimateMinutes: 15 });
    expect(parse('Lab tomorrow')).toEqual({ title: 'Lab', dueDate: '2026-11-24' });
    expect(parse('Project next week 10h').dueDate).toBe('2026-11-30');
    expect(parse('Paper in 2 weeks').dueDate).toBe('2026-12-07');
    expect(parse('Quiz in 3 days').dueDate).toBe('2026-11-26');
  });

  it('counts a weekday said today as today, and "next" as the one in the following week', () => {
    expect(parse('Standup notes monday').dueDate).toBe(TODAY);
    expect(parse('Review next wed').dueDate).toBe('2026-12-02');
    expect(parse('Review by wed').dueDate).toBe('2026-11-25');
  });

  it('reads month names and slashes, rolling into next year once the day has passed', () => {
    expect(parse('Final project dec 10 20h')).toEqual({ title: 'Final project', dueDate: '2026-12-10', estimateMinutes: 1200 });
    expect(parse('Taxes by April 15th').dueDate).toBe('2027-04-15');
    expect(parse('Lab report 11/30 1h30m')).toEqual({ title: 'Lab report', dueDate: '2026-11-30', estimateMinutes: 90 });
    expect(parse('Lab 2/30').dueDate).toBeUndefined();
  });

  it('leaves words that only look like dates or times in the title', () => {
    expect(parse('SAT prep 2h')).toEqual({ title: 'SAT prep', estimateMinutes: 120 });
    expect(parse("Today's reading")).toEqual({ title: "Today's reading" });
    expect(parse('CSE 485 homework')).toEqual({ title: 'CSE 485 homework' });
  });

  it('tidies words left dangling', () => {
    expect(parse('Essay - due Fri').title).toBe('Essay');
    expect(parse('Read chapter 4 for 2h').title).toBe('Read chapter 4');
  });
});
