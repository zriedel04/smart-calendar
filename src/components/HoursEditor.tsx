import { Plus, X } from 'lucide-react';
import { parseTime, toTimeInputValue, type TimeRange } from '../lib/time';
import { cx } from './cx';
import { inputClass } from './styles';

/** Edits a list of time blocks, e.g. 9am to 12pm and 2pm to 6pm. */
export function HoursEditor({
  ranges,
  onChange,
  label,
}: {
  ranges: readonly TimeRange[];
  onChange: (ranges: TimeRange[]) => void;
  label: string;
}) {
  function update(index: number, key: keyof TimeRange, value: string) {
    const minutes = parseTime(value);
    if (minutes === null) return;
    onChange(ranges.map((r, i) => (i === index ? { ...r, [key]: minutes } : r)));
  }

  function add() {
    const last = ranges[ranges.length - 1];
    const start = last ? Math.min(last.end + 60, 22 * 60) : 12 * 60;
    onChange([...ranges, { start, end: Math.min(start + 3 * 60, 24 * 60 - 1) }]);
  }

  return (
    <div className="space-y-2">
      {ranges.map((range, i) => {
        const invalid = range.end <= range.start;
        return (
          <div key={i} className="flex items-center gap-2">
            <input
              type="time"
              step={900}
              aria-label={`${label} block ${i + 1} start`}
              className={cx(inputClass, 'w-auto min-w-0 flex-1', invalid && 'ring-rose-400')}
              value={toTimeInputValue(range.start)}
              onChange={(e) => update(i, 'start', e.target.value)}
            />
            <span className="text-sm text-slate-400">to</span>
            <input
              type="time"
              step={900}
              aria-label={`${label} block ${i + 1} end`}
              className={cx(inputClass, 'w-auto min-w-0 flex-1', invalid && 'ring-rose-400')}
              value={toTimeInputValue(range.end)}
              onChange={(e) => update(i, 'end', e.target.value)}
            />
            <button
              type="button"
              onClick={() => onChange(ranges.filter((_, j) => j !== i))}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-rose-600 dark:hover:bg-slate-800"
              aria-label={`Remove ${label} block ${i + 1}`}
            >
              <X className="size-4" />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={add}
        className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-300"
      >
        <Plus className="size-4" /> {ranges.length ? 'Add another block' : 'Add hours'}
      </button>
    </div>
  );
}
