import { useShallow } from 'zustand/react/shallow';
import { useValidation } from '../../features/validation/useValidation';
import { useDiagram } from '../../store/diagramStore';
import { useUi } from '../../store/uiStore';
import { cn } from '../ui/cn';
import { DiagramProperties } from './DiagramProperties';
import { EdgeProperties } from './EdgeProperties';
import { IssuesPanel } from './IssuesPanel';
import { MultiProperties } from './MultiProperties';
import { NodeProperties } from './NodeProperties';

function SelectionProperties() {
  const selectedNodes = useDiagram(useShallow((s) => s.nodes.filter((n) => n.selected)));
  const selectedEdges = useDiagram(useShallow((s) => s.edges.filter((e) => e.selected)));
  if (selectedNodes.length === 1 && selectedEdges.length === 0) return <NodeProperties key={selectedNodes[0].id} node={selectedNodes[0]} />;
  if (selectedNodes.length === 0 && selectedEdges.length === 1) return <EdgeProperties key={selectedEdges[0].id} edge={selectedEdges[0]} />;
  if (selectedNodes.length + selectedEdges.length > 1) return <MultiProperties nodes={selectedNodes} edgeIds={selectedEdges.map((e) => e.id)} />;
  return <DiagramProperties />;
}

export function RightPanel() {
  const tab = useUi((s) => s.rightTab);
  const setTab = useUi((s) => s.setRightTab);
  const issues = useValidation();
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;
  return (
    <aside className="flex h-full w-full flex-col bg-surface" aria-label="Properties">
      <div role="tablist" className="flex gap-1 border-b border-line px-2 pt-2">
        {(['properties', 'issues'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              '-mb-px flex items-center gap-1.5 border-b-2 px-2.5 pt-1 pb-2 text-[12.5px] font-medium capitalize transition-colors',
              tab === t ? 'border-primary text-fg' : 'border-transparent text-muted hover:text-fg',
            )}
          >
            {t}
            {t === 'issues' && issues.length > 0 && (
              <span
                className={cn(
                  'rounded-full px-1.5 text-[10px] font-semibold',
                  errors ? 'bg-red-500/15 text-danger' : warnings ? 'bg-amber-500/15 text-warning' : 'bg-primary-soft text-primary',
                )}
              >
                {issues.length}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{tab === 'properties' ? <SelectionProperties /> : <IssuesPanel />}</div>
    </aside>
  );
}
