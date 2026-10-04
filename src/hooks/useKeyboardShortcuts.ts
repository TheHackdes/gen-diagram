import { useEffect } from 'react';
import { fitDiagram, flowApi } from '../features/canvas/flowApi';
import { projectActions } from '../features/projects/actions';
import { useDiagram } from '../store/diagramStore';
import { useUi } from '../store/uiStore';
import { isTypingTarget } from '../utils/misc';

let pointer: { x: number; y: number } | null = null;

/** Flow position of the mouse if it is over the canvas. */
function pointerOnCanvas() {
  const el = document.querySelector('.react-flow');
  if (!pointer || !el || !flowApi.instance) return undefined;
  const r = el.getBoundingClientRect();
  if (pointer.x < r.left || pointer.x > r.right || pointer.y < r.top || pointer.y > r.bottom) return undefined;
  return flowApi.instance.screenToFlowPosition(pointer);
}

function nudge(dx: number, dy: number) {
  const st = useDiagram.getState();
  const sel = st.nodes.filter((n) => n.selected && !n.data.locked);
  if (!sel.length) return;
  st.checkpoint('nudge');
  const ids = new Set(sel.map((n) => n.id));
  // Children move with their parent: only move selection roots.
  const roots = sel.filter((n) => !n.parentId || !ids.has(n.parentId));
  const rootIds = new Set(roots.map((n) => n.id));
  useDiagram.setState({
    nodes: st.nodes.map((n) => (rootIds.has(n.id) ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } } : n)),
    dirty: true,
  });
}

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      pointer = { x: e.clientX, y: e.clientY };
    };
    const onKey = (e: KeyboardEvent) => {
      const ui = useUi.getState();
      const st = useDiagram.getState();
      if (ui.view !== 'workspace') return;
      if (ui.dialog || ui.confirm || ui.prompt || ui.rulesFor) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (mod && key === 's') {
        e.preventDefault();
        if (e.shiftKey) projectActions.saveAs();
        else projectActions.save();
        return;
      }
      if (isTypingTarget(e.target)) return;

      if (ui.presentation) {
        if (key === 'escape' || key === 'p') ui.setPresentation(false);
        if (key === 'a') ui.setPresentationAnim(!ui.presentationAnim);
        return;
      }

      if (mod) {
        const handlers: Record<string, () => void> = {
          z: () => (e.shiftKey ? st.redo() : st.undo()),
          y: () => st.redo(),
          c: () => st.copySelection(),
          x: () => st.cutSelection(),
          v: () => st.paste(pointerOnCanvas()),
          d: () => st.duplicateSelection(),
          a: () => st.selectAll(),
          g: () => {
            if (e.shiftKey) {
              const sel = st.nodes.find((n) => n.selected);
              if (sel) st.ungroup(sel.id);
            } else st.groupSelection();
          },
          l: () => st.toggleLock(st.nodes.filter((n) => n.selected).map((n) => n.id)),
          o: () => ui.openDialog('open'),
          e: () => ui.openDialog('export'),
          k: () => {
            ui.setLeftTab('library');
            setTimeout(() => document.getElementById('library-search')?.focus(), 30);
          },
        };
        const h = handlers[key];
        if (h) {
          e.preventDefault();
          h();
        }
        return;
      }

      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          st.deleteSelection();
          break;
        case 'Escape':
          ui.setContextMenu(null);
          st.clearSelection();
          break;
        case 'ArrowLeft':
        case 'ArrowRight':
        case 'ArrowUp':
        case 'ArrowDown': {
          const step = e.shiftKey ? 10 : 1;
          const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]!;
          if (st.nodes.some((n) => n.selected)) {
            e.preventDefault();
            nudge(d[0], d[1]);
          }
          break;
        }
        case '+':
        case '=':
          void flowApi.instance?.zoomIn({ duration: 150 });
          break;
        case '-':
          void flowApi.instance?.zoomOut({ duration: 150 });
          break;
        case '!':
          fitDiagram();
          break;
        case '?':
          ui.openDialog('shortcuts');
          break;
        case '/':
          e.preventDefault();
          ui.setLeftTab('library');
          setTimeout(() => document.getElementById('library-search')?.focus(), 30);
          break;
        default:
          if (key === 'p' && !e.shiftKey) ui.setPresentation(true);
          if (key === 'l' && e.shiftKey) st.applyLayout('network');
          if (e.code === 'Digit1' && e.shiftKey) fitDiagram();
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousemove', onMove);
    };
  }, []);
}
