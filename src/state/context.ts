import { createContext, useContext, type Dispatch } from 'react';
import type { Action } from './reducer';
import type { AppData } from './types';

export interface StoreValue {
  data: AppData;
  dispatch: Dispatch<Action>;
}

export const StoreContext = createContext<StoreValue | null>(null);

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore must be used inside <StoreProvider>');
  return value;
}
