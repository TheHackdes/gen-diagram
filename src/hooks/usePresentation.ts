import { useEffect } from 'react';
import { fitDiagram } from '../features/canvas/flowApi';
import { useDiagram } from '../store/diagramStore';
import { useUi } from '../store/uiStore';

/** Enter/leave fullscreen with presentation mode and keep the diagram centered. */
export function usePresentation(): void {
  const on = useUi((s) => s.presentation);
  useEffect(() => {
    if (on) {
      useUi.getState().setContextMenu(null);
      useDiagram.getState().clearSelection();
      document.documentElement.requestFullscreen?.().catch(() => undefined);
      setTimeout(() => fitDiagram(500), 120);
    } else if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      setTimeout(() => fitDiagram(300), 120);
    }
  }, [on]);
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement && useUi.getState().presentation) useUi.getState().setPresentation(false);
    };
    const onResize = () => {
      if (useUi.getState().presentation) fitDiagram(200);
    };
    document.addEventListener('fullscreenchange', onChange);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      window.removeEventListener('resize', onResize);
    };
  }, []);
}
