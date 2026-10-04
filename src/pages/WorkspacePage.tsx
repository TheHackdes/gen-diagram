import { ReactFlowProvider } from '@xyflow/react';
import { Minimize2 } from 'lucide-react';
import { Canvas } from '../components/canvas/Canvas';
import { CustomOsDialog } from '../components/dialogs/CustomOsDialog';
import { ExportDialog } from '../components/dialogs/ExportDialog';
import { OpenProjectDialog } from '../components/dialogs/OpenProjectDialog';
import { RulesEditorDialog } from '../components/dialogs/RulesEditorDialog';
import { ShortcutsDialog } from '../components/dialogs/ShortcutsDialog';
import { TemplatesDialog } from '../components/dialogs/TemplatesDialog';
import { RightPanel } from '../components/properties/RightPanel';
import { LeftSidebar } from '../components/sidebar/LeftSidebar';
import { StatusBar } from '../components/toolbar/StatusBar';
import { TopBar } from '../components/toolbar/TopBar';
import { cn } from '../components/ui/cn';
import { useAutosave } from '../hooks/useAutosave';
import { useDockedTables } from '../hooks/useDockedTables';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { usePresentation } from '../hooks/usePresentation';
import { useDiagram } from '../store/diagramStore';
import { useUi } from '../store/uiStore';

function PresentationOverlay() {
  const name = useDiagram((s) => s.metadata.name);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-4">
      <div className="pointer-events-auto rounded-xl border border-line bg-surface/85 px-3 py-1.5 text-[13px] font-semibold text-fg shadow-sm backdrop-blur">{name}</div>
      <button
        type="button"
        onClick={() => useUi.getState().setPresentation(false)}
        className="pointer-events-auto flex items-center gap-1.5 rounded-xl border border-line bg-surface/85 px-3 py-1.5 text-[12.5px] font-medium text-muted shadow-sm backdrop-blur hover:text-fg"
      >
        <Minimize2 size={14} /> Exit <span className="text-subtle">Esc</span>
      </button>
    </div>
  );
}

export function WorkspacePage() {
  const leftOpen = useUi((s) => s.leftOpen);
  const rightOpen = useUi((s) => s.rightOpen);
  const presentation = useUi((s) => s.presentation);
  useKeyboardShortcuts();
  useAutosave();
  usePresentation();
  useDockedTables();

  const closeOverlays = () => {
    if (window.innerWidth < 1024) {
      useUi.getState().setLeftOpen(false);
      useUi.getState().setRightOpen(false);
    }
  };

  return (
    <ReactFlowProvider>
      <div className="flex h-full flex-col overflow-hidden bg-bg">
        {!presentation && <TopBar />}
        <div className="relative flex min-h-0 flex-1">
          {!presentation && leftOpen && (
            <div className="absolute inset-y-0 left-0 z-30 w-72 border-r border-line shadow-xl lg:static lg:z-auto lg:w-72 lg:shadow-none xl:w-[280px]">
              <LeftSidebar />
            </div>
          )}
          <main className="relative min-w-0 flex-1" aria-label="Diagram canvas">
            <Canvas />
            {presentation && <PresentationOverlay />}
            {!presentation && (leftOpen || rightOpen) && (
              <div className={cn('absolute inset-0 z-20 bg-[var(--overlay)] lg:hidden')} onClick={closeOverlays} />
            )}
          </main>
          {!presentation && rightOpen && (
            <div className="absolute inset-y-0 right-0 z-30 w-80 border-l border-line shadow-xl lg:static lg:z-auto lg:shadow-none">
              <RightPanel />
            </div>
          )}
        </div>
        {!presentation && <StatusBar />}
      </div>
      <ExportDialog />
      <OpenProjectDialog />
      <TemplatesDialog />
      <ShortcutsDialog />
      <CustomOsDialog />
      <RulesEditorDialog />
    </ReactFlowProvider>
  );
}
