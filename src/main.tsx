import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { flowApi } from './features/canvas/flowApi';
import { useDiagram } from './store/diagramStore';
import { useUi } from './store/uiStore';
import './index.css';

if (import.meta.env.DEV) {
  // Handy for debugging and automated checks; stripped from production builds.
  Object.assign(window, { __infra: { useDiagram, useUi, flowApi } });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
