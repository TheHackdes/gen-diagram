import { CircleAlert, CircleCheck, EyeOff, Grid3x3, Magnet, Maximize, Minus, Plus, TriangleAlert } from 'lucide-react';
import { fitDiagram, flowApi } from '../../features/canvas/flowApi';
import { DEFAULT_VIEW, hiddenCount, isFiltered, VIEW_PRESETS, viewOf } from '../../features/canvas/views';
import { useValidation } from '../../features/validation/useValidation';
import { useDiagram } from '../../store/diagramStore';
import { useUi } from '../../store/uiStore';
import { IconButton } from '../ui/Button';

function SaveState() {
  const dirty = useDiagram((s) => s.dirty);
  const savedAt = useDiagram((s) => s.savedAt);
  if (dirty) return <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-warning" />Unsaved changes</span>;
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-1.5 w-1.5 rounded-full bg-success" />
      Saved{savedAt ? ` · ${new Date(savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
    </span>
  );
}

/** Active view: what is hidden, and a way back to everything. */
function ViewState() {
  const label = useDiagram((s) => {
    const view = viewOf(s.settings);
    if (!isFiltered(view)) return '';
    const name = view.preset === 'custom' ? 'Custom' : VIEW_PRESETS.find((p) => p.id === view.preset)?.label;
    const hidden = hiddenCount(s.nodes, s.edges, view);
    return `${name} view${hidden ? ` · ${hidden} hidden` : ''}`;
  });
  if (!label) return null;
  return (
    <span className="flex items-center gap-1.5 rounded bg-primary-soft px-1.5 text-primary">
      <EyeOff size={12} />
      {label}
      <button type="button" onClick={() => useDiagram.getState().setSettings({ view: DEFAULT_VIEW })} className="font-medium underline-offset-2 hover:underline">
        Show all
      </button>
    </span>
  );
}

export function StatusBar() {
  const zoom = useUi((s) => s.zoom);
  const counts = useDiagram((s) => `${s.nodes.length}|${s.edges.length}|${s.nodes.filter((n) => n.selected).length + s.edges.filter((e) => e.selected).length}`).split('|');
  const settings = useDiagram((s) => s.settings);
  const setSettings = useDiagram((s) => s.setSettings);
  const issues = useValidation();
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;

  return (
    <footer className="flex h-8 shrink-0 items-center gap-3 border-t border-line bg-surface px-3 text-[11.5px] text-muted">
      <SaveState />
      <span className="hidden sm:inline">
        {counts[0]} elements · {counts[1]} links
        {counts[2] !== '0' && <span className="text-primary"> · {counts[2]} selected</span>}
      </span>
      <button type="button" onClick={() => useUi.getState().setRightTab('issues')} className="flex items-center gap-1 rounded px-1 hover:text-fg">
        {errors ? <CircleAlert size={13} className="text-danger" /> : warnings ? <TriangleAlert size={13} className="text-warning" /> : <CircleCheck size={13} className="text-success" />}
        {issues.length ? `${errors} errors · ${warnings} warnings` : 'No issues'}
      </button>
      <ViewState />
      <span className="flex-1" />
      <IconButton size="sm" label="Show grid" active={settings.showGrid} onClick={() => setSettings({ showGrid: !settings.showGrid })} tooltipSide="top">
        <Grid3x3 size={14} />
      </IconButton>
      <IconButton size="sm" label="Snap to grid" active={settings.snapToGrid} onClick={() => setSettings({ snapToGrid: !settings.snapToGrid })} tooltipSide="top">
        <Magnet size={14} />
      </IconButton>
      <span className="h-4 w-px bg-line" />
      <IconButton size="sm" label="Zoom out" shortcut="-" onClick={() => void flowApi.instance?.zoomOut({ duration: 150 })} tooltipSide="top">
        <Minus size={14} />
      </IconButton>
      <button type="button" onClick={() => void flowApi.instance?.zoomTo(1, { duration: 200 })} className="w-11 rounded text-center font-medium tabular-nums hover:text-fg" title="Reset to 100%">
        {Math.round(zoom * 100)}%
      </button>
      <IconButton size="sm" label="Zoom in" shortcut="+" onClick={() => void flowApi.instance?.zoomIn({ duration: 150 })} tooltipSide="top">
        <Plus size={14} />
      </IconButton>
      <IconButton size="sm" label="Fit to screen" shortcut="⇧1" onClick={() => fitDiagram()} tooltipSide="top">
        <Maximize size={14} />
      </IconButton>
    </footer>
  );
}
