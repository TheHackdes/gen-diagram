import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import { flowApi } from '../../features/canvas/flowApi';
import { useValidation } from '../../features/validation/useValidation';
import { useDiagram } from '../../store/diagramStore';
import type { IssueSeverity, ValidationIssue } from '../../types';
import { cn } from '../ui/cn';

const ICONS: Record<IssueSeverity, React.ReactNode> = {
  error: <CircleAlert size={15} className="text-danger" />,
  warning: <TriangleAlert size={15} className="text-warning" />,
  info: <Info size={15} className="text-primary" />,
};

function focusIssue(issue: ValidationIssue) {
  useDiagram.getState().select(issue.nodeIds ?? [], issue.edgeIds ?? []);
  const inst = flowApi.instance;
  if (!inst) return;
  const ids = issue.nodeIds?.length
    ? issue.nodeIds
    : (issue.edgeIds ?? []).flatMap((id) => {
        const e = inst.getEdge(id);
        return e ? [e.source, e.target] : [];
      });
  if (ids.length) void inst.fitView({ nodes: ids.map((id) => ({ id })), duration: 400, padding: 0.6, maxZoom: 1.2 });
}

export function IssuesPanel() {
  const issues = useValidation();
  if (!issues.length) {
    return (
      <div className="flex flex-col items-center px-6 py-12 text-center">
        <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-success">
          <CircleCheck size={20} />
        </span>
        <p className="text-[13px] font-medium text-fg">No issues found</p>
        <p className="mt-1 text-[12px] text-muted">Addresses, VLANs, ports and links are consistent.</p>
      </div>
    );
  }
  const counts = { error: 0, warning: 0, info: 0 };
  for (const i of issues) counts[i.severity]++;
  return (
    <div>
      <div className="flex gap-3 border-b border-line px-4 py-3 text-[12px] text-muted">
        <span className="flex items-center gap-1">{ICONS.error} {counts.error} errors</span>
        <span className="flex items-center gap-1">{ICONS.warning} {counts.warning} warnings</span>
        <span className="flex items-center gap-1">{ICONS.info} {counts.info} info</span>
      </div>
      <ul className="p-2">
        {issues.map((i) => (
          <li key={i.id}>
            <button
              type="button"
              onClick={() => focusIssue(i)}
              disabled={!i.nodeIds?.length && !i.edgeIds?.length}
              className={cn('flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] leading-snug text-fg hover:bg-surface-2 disabled:hover:bg-transparent')}
            >
              <span className="mt-px shrink-0">{ICONS[i.severity]}</span>
              <span>{i.message}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
