import { useEffect, useState } from 'react';
import { localToday, type ISODate } from '../lib/dates';

/** Today's local date. Updates on its own after midnight or when you come back to the tab. */
export function useToday(): ISODate {
  const [today, setToday] = useState(() => localToday());

  useEffect(() => {
    const refresh = () => setToday((prev) => {
      const now = localToday();
      return now === prev ? prev : now;
    });
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  return today;
}
