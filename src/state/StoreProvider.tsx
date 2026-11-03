import { useEffect, useMemo, useReducer, type ReactNode } from 'react';
import { StoreContext } from './context';
import { createEmptyData } from './defaults';
import { reducer } from './reducer';
import { createLocalStorageAdapter, type StorageAdapter } from './storage';

export function StoreProvider({
  children,
  storage,
}: {
  children: ReactNode;
  storage?: StorageAdapter;
}) {
  const adapter = useMemo(() => storage ?? createLocalStorageAdapter(), [storage]);
  const [data, dispatch] = useReducer(reducer, undefined, () => adapter.load() ?? createEmptyData());

  useEffect(() => {
    adapter.save(data);
  }, [adapter, data]);

  const value = useMemo(() => ({ data, dispatch }), [data]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
