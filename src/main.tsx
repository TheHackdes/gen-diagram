import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { flowApi } from './features/canvas/flowApi';
import { initStorage, onStorageError, StorageQuotaError } from './features/projects/storage';
import { useDiagram } from './store/diagramStore';
import { useUi } from './store/uiStore';
import './index.css';

// Also exposed in benchmark builds (VITE_EXPOSE_STORES=1 npm run build), never in normal builds.
if (import.meta.env.DEV || import.meta.env.VITE_EXPOSE_STORES === '1') {
  // Handy for debugging and automated checks; stripped from production builds.
  Object.assign(window, { __infra: { useDiagram, useUi, flowApi } });
}

// Projects are loaded from IndexedDB before the first render.
void initStorage().then(() => {
  onStorageError((e) =>
    useUi.getState().toast(e instanceof StorageQuotaError ? 'Browser storage is full — export the project to JSON.' : `Could not save locally: ${e.message}`, 'error'),
  );
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
