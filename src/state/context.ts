import { createContext, useContext, type Dispatch } from 'react';
import type { Action } from './reducer';
import type { AppData } from './types';

/** Store actions, plus taking back the last undoable one or dismissing its offer. */
export type StoreAction = Action | { type: 'undo' } | { type: 'undo/dismiss' };

export interface StoreValue {
  data: AppData;
  dispatch: Dispatch<StoreAction>;
  /** The last action you can still undo, described in words. */
  undo: { label: string; id: number } | null;
}

export const StoreContext = createContext<StoreValue | null>(null);

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore must be used inside <StoreProvider>');
  return value;
}
