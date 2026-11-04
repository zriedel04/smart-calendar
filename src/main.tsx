import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { StoreProvider } from './state/StoreProvider';
import { supabaseBackend } from './sync/backend';
import { SyncProvider } from './sync/SyncProvider';
import { loadSyncState, saveSyncState } from './sync/syncState';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <SyncProvider backend={supabaseBackend()} syncState={{ load: loadSyncState, save: saveSyncState }}>
        <App />
      </SyncProvider>
    </StoreProvider>
  </StrictMode>,
);
