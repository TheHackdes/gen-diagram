import { useEffect } from 'react';
import { ConfirmDialog, PromptDialog, Toaster } from './components/dialogs/SystemDialogs';
import { listProjects } from './features/projects/storage';
import { HomePage } from './pages/HomePage';
import { WorkspacePage } from './pages/WorkspacePage';
import { useDiagram } from './store/diagramStore';
import { useUi } from './store/uiStore';

const SEEDED_KEY = 'infracanvas.seeded';

export function App() {
  const view = useUi((s) => s.view);

  useEffect(() => {
    // First launch: build the demo project so the product shows what it can do.
    let seeded = false;
    try {
      seeded = localStorage.getItem(SEEDED_KEY) === '1';
      if (!seeded) localStorage.setItem(SEEDED_KEY, '1');
    } catch {
      /* storage disabled */
    }
    if (!seeded && listProjects().length === 0) {
      useDiagram.getState().newProject('demo');
      useUi.getState().setView('workspace');
    }
  }, []);

  return (
    <>
      {view === 'home' ? <HomePage /> : <WorkspacePage />}
      <ConfirmDialog />
      <PromptDialog />
      <Toaster />
    </>
  );
}
