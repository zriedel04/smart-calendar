import { useEffect, useState, useSyncExternalStore } from 'react';

const SHOW_TIMES_KEY = 'smart-calendar:show-times';
const DUE_ONLY_KEY = 'smart-calendar:month-due-only';
const HOLIDAYS_KEY = 'smart-calendar:show-holidays';

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be blocked, as in some private windows; the choice just won't be remembered.
  }
}

/** Whether to show suggested times next to planned work. On unless you turn it off; kept per device. */
export function useShowTimes(): [boolean, (next: boolean) => void] {
  const [show, setShow] = useState(() => read(SHOW_TIMES_KEY) !== 'off');
  const update = (next: boolean) => {
    setShow(next);
    write(SHOW_TIMES_KEY, next ? 'on' : 'off');
  };
  return [show, update];
}

/**
 * Whether the month calendar shows only what's due, like a school calendar, instead of also the
 * work planned each day. Off unless you turn it on; kept per device.
 */
export function useDueDatesOnly(): [boolean, (next: boolean) => void] {
  const [dueOnly, setDueOnly] = useState(() => read(DUE_ONLY_KEY) === 'on');
  const update = (next: boolean) => {
    setDueOnly(next);
    write(DUE_ONLY_KEY, next ? 'on' : 'off');
  };
  return [dueOnly, update];
}

const holidayListeners = new Set<() => void>();
// Kept in memory too, so the switch still works where storage is blocked.
let showHolidays = read(HOLIDAYS_KEY) !== 'off';

/**
 * Whether US holidays show on the calendar. On unless you turn it off; kept per device. Every view
 * using it updates together when it changes.
 */
export function useShowHolidays(): [boolean, (next: boolean) => void] {
  const show = useSyncExternalStore(
    (listener) => {
      holidayListeners.add(listener);
      return () => holidayListeners.delete(listener);
    },
    () => showHolidays,
  );
  const update = (next: boolean) => {
    showHolidays = next;
    write(HOLIDAYS_KEY, next ? 'on' : 'off');
    for (const listener of holidayListeners) listener();
  };
  return [show, update];
}

/** Minutes since midnight, updated every minute. */
export function useClockMinutes(): number {
  const now = () => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  };
  const [minutes, setMinutes] = useState(now);
  useEffect(() => {
    const timer = window.setInterval(() => setMinutes(now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return minutes;
}
