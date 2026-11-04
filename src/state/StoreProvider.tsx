import { useEffect, useMemo, useReducer, type ReactNode } from 'react';
import { StoreContext } from './context';
import { createEmptyData } from './defaults';
import { createLocalStorageAdapter, type StorageAdapter } from './storage';
import { storeReducer } from './undo';

export function StoreProvider({
  children,
  storage,
}: {
  children: ReactNode;
  storage?: StorageAdapter;
}) {
  const adapter = useMemo(() => storage ?? createLocalStorageAdapter(), [storage]);
  const [{ data, undo }, dispatch] = useReducer(storeReducer, undefined, () => ({
    data: adapter.load() ?? createEmptyData(),
    undo: null,
  }));

  useEffect(() => {
    adapter.save(data);
  }, [adapter, data]);

  // Pick up changes saved by another open tab, so this tab never writes over them with stale data.
  useEffect(
    () => adapter.subscribe?.((next) => dispatch({ type: 'data/replace', data: next })),
    [adapter],
  );

  const undoOffer = useMemo(() => (undo ? { label: undo.label, id: undo.id } : null), [undo]);
  const value = useMemo(() => ({ data, dispatch, undo: undoOffer }), [data, undoOffer]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
