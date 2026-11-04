import { RotateCcw, X } from 'lucide-react';
import { useEffect } from 'react';
import { useStore } from '../state/context';

const SHOW_MS = 8000;

/** Offers to take back the last tick, skip, push or delete for a few seconds. */
export function UndoToast() {
  const { undo, dispatch } = useStore();

  useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(() => dispatch({ type: 'undo/dismiss' }), SHOW_MS);
    return () => window.clearTimeout(timer);
  }, [undo, dispatch]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4" role="status" aria-live="polite">
      {undo && (
        <div className="pointer-events-auto flex min-w-0 max-w-md items-center gap-3 rounded-xl bg-slate-900 py-2 pr-2 pl-4 text-sm text-white shadow-lg dark:bg-slate-700">
          <span className="min-w-0 truncate">{undo.label}</span>
          <button
            type="button"
            onClick={() => dispatch({ type: 'undo' })}
            className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 font-semibold text-indigo-300 hover:bg-white/10"
          >
            <RotateCcw className="size-3.5" /> Undo
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: 'undo/dismiss' })}
            aria-label="Dismiss"
            className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
