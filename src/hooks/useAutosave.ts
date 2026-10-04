import { useEffect } from 'react';
import { useDiagram } from '../store/diagramStore';

/** Persist the open project to local storage shortly after each change. */
export function useAutosave(delay = 1500): void {
  useEffect(() => {
    let timer: number | undefined;
    const unsub = useDiagram.subscribe((s, prev) => {
      if (!s.dirty) return;
      if (s.nodes === prev.nodes && s.edges === prev.edges && s.vlans === prev.vlans && s.metadata === prev.metadata && s.settings === prev.settings && s.dirty === prev.dirty) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        // Do not save mid-drag, nor while an export shows a temporary rules table.
        if (useDiagram.getState().nodes.some((n) => n.dragging || n.id.startsWith('tmp_'))) return;
        try {
          useDiagram.getState().save();
        } catch {
          /* quota errors are reported on manual save */
        }
      }, delay);
    });
    return () => {
      unsub();
      window.clearTimeout(timer);
    };
  }, [delay]);
}
