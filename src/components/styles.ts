import type { Priority } from '../lib/priority';

export const PRIORITY_DOT: Record<Priority, string> = {
  overdue: 'bg-rose-600',
  urgent: 'bg-rose-500',
  needed: 'bg-amber-500',
  todo: 'bg-slate-400',
};

export const inputClass =
  'block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 dark:bg-slate-950 dark:text-slate-100 dark:ring-slate-700 dark:[color-scheme:dark]';
