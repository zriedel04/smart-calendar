import { useState } from 'react';
import { hasOverride, workingHoursOn } from '../lib/availability';
import { formatDate, isISODate, weekdayOf, WEEKDAY_NAMES, type ISODate } from '../lib/dates';
import { formatRange, normalizeRanges, totalMinutes, formatDuration, type TimeRange } from '../lib/time';
import { useStore } from '../state/context';
import { HoursEditor } from './HoursEditor';
import { inputClass } from './styles';
import { Button, Field, Modal } from './ui';

function sameRanges(a: readonly TimeRange[], b: readonly TimeRange[]): boolean {
  const x = normalizeRanges(a);
  const y = normalizeRanges(b);
  return x.length === y.length && x.every((r, i) => r.start === y[i]!.start && r.end === y[i]!.end);
}

/** Changes the working hours for one date without touching the weekday's usual hours. */
export function DayHoursDialog({
  date: initialDate,
  today,
  onClose,
}: {
  date?: ISODate;
  today: ISODate;
  onClose: () => void;
}) {
  const { data, dispatch } = useStore();
  const [date, setDate] = useState(initialDate ?? today);
  const [ranges, setRanges] = useState<TimeRange[]>(() => workingHoursOn(data, initialDate ?? today));
  const validDate = isISODate(date);
  const usual = validDate ? normalizeRanges(data.weeklyHours[weekdayOf(date)] ?? []) : [];
  const overridden = validDate && hasOverride(data, date);
  const invalid = ranges.some((r) => r.end <= r.start);

  function pickDate(value: string) {
    setDate(value);
    if (isISODate(value)) setRanges(workingHoursOn(data, value));
  }

  function save() {
    if (!validDate || invalid) return;
    if (sameRanges(ranges, usual)) {
      dispatch({ type: 'hours/clearOverride', date });
    } else {
      dispatch({ type: 'hours/setOverride', date, ranges: normalizeRanges(ranges) });
    }
    onClose();
  }

  function reset() {
    dispatch({ type: 'hours/clearOverride', date });
    onClose();
  }

  const weekdayName = validDate ? WEEKDAY_NAMES[weekdayOf(date)] : 'that day';
  const title = initialDate
    ? `Hours for ${formatDate(initialDate, { weekday: 'long', month: 'short', day: 'numeric' })}`
    : 'Change hours for a date';

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          {overridden && (
            <Button variant="ghost" onClick={reset} className="mr-auto">
              Use usual hours
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={!validDate || invalid}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!initialDate && (
          <Field label="Date">
            {(id) => (
              <input
                id={id}
                type="date"
                min={today}
                className={inputClass}
                value={date}
                onChange={(e) => pickDate(e.target.value)}
              />
            )}
          </Field>
        )}

        <p className="text-sm text-slate-500 dark:text-slate-400">
          This only changes {initialDate ? 'this day' : 'the date you pick'}. Your usual {weekdayName} hours
          {usual.length ? ` (${usual.map(formatRange).join(', ')})` : ' (off)'} stay the same for other weeks.
        </p>

        <HoursEditor label="Hours" ranges={ranges} onChange={setRanges} />

        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => setRanges([])}
            className="font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
          >
            Take the day off
          </button>
          <span className="text-slate-500 dark:text-slate-400">
            {invalid ? (
              <span className="text-rose-600 dark:text-rose-400">Each block must end after it starts.</span>
            ) : (
              `${formatDuration(totalMinutes(normalizeRanges(ranges)))} total`
            )}
          </span>
        </div>
      </div>
    </Modal>
  );
}
