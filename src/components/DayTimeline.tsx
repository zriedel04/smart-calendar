import { eventKind, type CalendarEvent } from '../lib/availability';
import { placeItems, timelineHours, type TimelineItem } from '../lib/dayLayout';
import { formatClock, formatRange, type Minutes, type TimeRange } from '../lib/time';
import type { Task } from '../state/types';
import { cx } from './cx';
import { EVENT_CHIP } from './eventStyles';

/** A stretch of time the planner suggests working on a task. */
export interface WorkBlock {
  task: Task;
  range: TimeRange;
  /** Extra words after the time, such as "1h left after this". */
  note?: string;
}

type Entry = { kind: 'event'; event: CalendarEvent } | { kind: 'work'; block: WorkBlock };

/** Pixels for one hour. Half an hour is tall enough for a title and its time. */
const HOUR_HEIGHT = 48;
const px = (minutes: Minutes) => (minutes / 60) * HOUR_HEIGHT;
/** The shortest a block is drawn, so a 15 minute one still fits a line of text. */
const MIN_HEIGHT = 20;
/** How much of the day the shortest block covers, plus the 2px gap below each one. */
const MIN_MINUTES = ((MIN_HEIGHT + 2) / HOUR_HEIGHT) * 60;

/**
 * A day drawn hour by hour, like a calendar app's day view: your work hours shaded, events where
 * they happen, the work the planner suggests in between, and a line at the current time.
 */
export function DayTimeline({
  events,
  working,
  blocks,
  now,
  onOpenEvent,
  onOpenTask,
}: {
  /** Timed events only; all-day ones go above the timeline. */
  events: readonly CalendarEvent[];
  working: readonly TimeRange[];
  blocks: readonly WorkBlock[];
  /** The current time, when the timeline shows today. */
  now?: Minutes;
  onOpenEvent: (event: CalendarEvent) => void;
  onOpenTask: (task: Task) => void;
}) {
  const items: TimelineItem<Entry>[] = [
    ...events.map((event) => ({ start: event.start, end: event.end, item: { kind: 'event' as const, event } })),
    ...blocks.map((block) => ({ start: block.range.start, end: block.range.end, item: { kind: 'work' as const, block } })),
  ];
  const hours = timelineHours([...working, ...items]);
  const placed = placeItems(items, MIN_MINUTES);
  const hourMarks: Minutes[] = [];
  for (let m = hours.start; m <= hours.end; m += 60) hourMarks.push(m);
  const top = (m: Minutes) => px(Math.min(Math.max(m, hours.start), hours.end) - hours.start);
  const showNow = now !== undefined && now >= hours.start && now <= hours.end;

  return (
    <div className="flex" style={{ height: px(hours.end - hours.start) + 12 }}>
      <div className="relative w-11 shrink-0 text-[11px] text-slate-500 dark:text-slate-400" aria-hidden>
        {hourMarks.map((m) => (
          <span key={m} className="absolute right-2 -translate-y-1/2" style={{ top: top(m) + 6 }}>
            {formatClock(m)}
          </span>
        ))}
      </div>
      <div className="relative mt-1.5 flex-1 border-l border-slate-200 dark:border-slate-800">
        {hourMarks.map((m) => (
          <div key={m} className="absolute inset-x-0 border-t border-slate-100 dark:border-slate-800/70" style={{ top: top(m) }} />
        ))}
        {working.map((r) => (
          <div
            key={`${r.start}-${r.end}`}
            className="absolute inset-x-0 bg-indigo-500/5 dark:bg-indigo-400/[0.04]"
            style={{ top: top(r.start), height: top(r.end) - top(r.start) }}
          />
        ))}

        {placed.map(({ start, end, lane, lanes, item }) => {
          const height = Math.max(MIN_HEIGHT, top(end) - top(start) - 2);
          const short = height < 34;
          const style = {
            top: top(start) + 1,
            height,
            left: `calc(${(lane / lanes) * 100}% + 4px)`,
            width: `calc(${100 / lanes}% - 8px)`,
          };
          const title = item.kind === 'event' ? item.event.title : item.block.task.title;
          const label =
            item.kind === 'event'
              ? [formatRange(item.event), item.event.location].filter(Boolean).join(' · ')
              : ['Work', formatRange(item.block.range), item.block.note].filter(Boolean).join(' · ');
          // A short block has one line: just the start time, or only the title in a narrow column.
          const detail = !short ? label : lanes > 1 ? '' : formatClock(start);
          return (
            <button
              key={item.kind === 'event' ? `e-${item.event.id}` : `w-${item.block.task.id}-${start}`}
              type="button"
              aria-label={`${title}, ${label}`}
              onClick={() => (item.kind === 'event' ? onOpenEvent(item.event) : onOpenTask(item.block.task))}
              className={cx(
                'absolute flex overflow-hidden rounded-lg px-2 text-left focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none',
                short ? 'items-center gap-1.5 py-0.5' : 'flex-col gap-px py-1',
                item.kind === 'event'
                  ? EVENT_CHIP[eventKind(item.event)]
                  : 'border-[1.5px] border-dashed border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-400/50 dark:bg-indigo-500/15 dark:text-indigo-100',
              )}
              style={style}
            >
              <span className={cx('min-w-0 truncate font-semibold', short ? 'text-xs' : 'text-[13px]')}>{title}</span>
              {detail && <span className={cx('min-w-0 text-[11px] opacity-80', short ? 'shrink-0' : 'line-clamp-2')}>{detail}</span>}
            </button>
          );
        })}

        {showNow && (
          <div className="pointer-events-none absolute inset-x-0" style={{ top: top(now) }}>
            <div className="border-t-2 border-rose-600 dark:border-rose-400" />
            <div className="absolute -top-[5px] -left-[5px] size-2.5 rounded-full bg-rose-600 dark:bg-rose-400" />
            <span className="sr-only">Now, {formatClock(now)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
