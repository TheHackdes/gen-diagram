import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  Position,
  useInternalNode,
  useStore,
  type EdgeProps,
  type InternalNode,
  type ReactFlowState,
} from '@xyflow/react';
import { Lock } from 'lucide-react';
import { memo } from 'react';
import { CONNECTION_STYLE } from '../../../features/connections/suggest';
import { useDiagram } from '../../../store/diagramStore';
import type { InfraEdge, InfraNode } from '../../../types';
import { cn } from '../../ui/cn';

interface Side {
  x: number;
  y: number;
  pos: Position;
}

function box(n: InternalNode<InfraNode>) {
  const { x, y } = n.internals.positionAbsolute;
  const w = n.measured.width ?? n.width ?? 0;
  const h = n.measured.height ?? n.height ?? 0;
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
}

/** Pick the facing sides of two nodes so links always leave from the closest edge. */
function floatingSides(a: InternalNode<InfraNode>, b: InternalNode<InfraNode>): [Side, Side] {
  const A = box(a);
  const B = box(b);
  const dx = B.cx - A.cx;
  const dy = B.cy - A.cy;
  // Prefer vertical routing unless nodes are clearly side by side.
  const overlapY = A.y < B.y + B.h && B.y < A.y + A.h;
  const horizontal = overlapY || Math.abs(dx) / (A.w / 2 + B.w / 2) > Math.abs(dy) / (A.h / 2 + B.h / 2) * 1.6;
  if (horizontal) {
    return dx >= 0
      ? [{ x: A.x + A.w, y: A.cy, pos: Position.Right }, { x: B.x, y: B.cy, pos: Position.Left }]
      : [{ x: A.x, y: A.cy, pos: Position.Left }, { x: B.x + B.w, y: B.cy, pos: Position.Right }];
  }
  return dy >= 0
    ? [{ x: A.cx, y: A.y + A.h, pos: Position.Bottom }, { x: B.cx, y: B.y, pos: Position.Top }]
    : [{ x: A.cx, y: A.y, pos: Position.Top }, { x: B.cx, y: B.y + B.h, pos: Position.Bottom }];
}

/**
 * Position of this edge among all edges leaving `nodeId` by the same side,
 * ordered by the position of the node at the other end: "index/count".
 */
function slotOn(s: ReactFlowState, nodeId: string, edgeId: string): string {
  const self = s.nodeLookup.get(nodeId) as InternalNode<InfraNode> | undefined;
  if (!self) return '0/1';
  const items: { id: string; side: Position; key: number }[] = [];
  for (const e of s.edges) {
    if (e.source !== nodeId && e.target !== nodeId) continue;
    const other = s.nodeLookup.get(e.source === nodeId ? e.target : e.source) as InternalNode<InfraNode> | undefined;
    if (!other) continue;
    const [side] = floatingSides(self, other);
    const o = box(other);
    const vertical = side.pos === Position.Top || side.pos === Position.Bottom;
    items.push({ id: e.id, side: side.pos, key: vertical ? o.cx : o.cy });
  }
  const mine = items.find((i) => i.id === edgeId);
  if (!mine) return '0/1';
  const same = items.filter((i) => i.side === mine.side).sort((a, b) => a.key - b.key || a.id.localeCompare(b.id));
  return `${same.findIndex((i) => i.id === edgeId)}/${same.length}`;
}

function spread(side: Side, n: InternalNode<InfraNode>, slot: string): Side {
  const [index, count] = slot.split('/').map(Number);
  if (count <= 1) return side;
  const b = box(n);
  const vertical = side.pos === Position.Top || side.pos === Position.Bottom;
  const length = vertical ? b.w : b.h;
  const gap = count <= 3 ? 56 : 22;
  const span = Math.min(length * 0.75, (count - 1) * gap);
  const offset = -span / 2 + (index * span) / (count - 1);
  return vertical ? { ...side, x: side.x + offset } : { ...side, y: side.y + offset };
}

/** Too many links on one side: port tags would overlap (they stay in the properties panel). */
const crowded = (slot: string) => Number(slot.split('/')[1]) > 3;

function portLabelStyle(side: Side): React.CSSProperties {
  const t = {
    [Position.Bottom]: `translate(${side.x + 5}px, ${side.y + 4}px)`,
    [Position.Top]: `translate(${side.x + 5}px, ${side.y - 4}px) translateY(-100%)`,
    [Position.Right]: `translate(${side.x + 6}px, ${side.y - 4}px) translateY(-100%)`,
    [Position.Left]: `translate(${side.x - 6}px, ${side.y - 4}px) translate(-100%, -100%)`,
  }[side.pos];
  return { transform: t, position: 'absolute', pointerEvents: 'none' };
}

function NetworkEdgeImpl({ id, source, target, data, selected }: EdgeProps<InfraEdge>) {
  const s = useInternalNode<InfraNode>(source);
  const t = useInternalNode<InfraNode>(target);
  const showLabels = useDiagram((st) => st.settings.showEdgeLabels);
  const showPorts = useDiagram((st) => st.settings.showPortLabels);
  const vlanIds = (data?.vlan ?? '').split(/[\s,]+/).filter(Boolean);
  const firstVlan = useDiagram((st) => (vlanIds.length ? st.vlans.find((v) => String(v.id) === vlanIds[0]) : undefined));
  const sourceSlot = useStore((st) => slotOn(st, source, id));
  const targetSlot = useStore((st) => slotOn(st, target, id));
  if (!s || !t) return null;

  const [rawA, rawB] = floatingSides(s, t);
  const a = spread(rawA, s, sourceSlot);
  const b = spread(rawB, t, targetSlot);
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX: a.x,
    sourceY: a.y,
    sourcePosition: a.pos,
    targetX: b.x,
    targetY: b.y,
    targetPosition: b.pos,
    borderRadius: 10,
    offset: 18,
  });

  const type = data?.connType ?? 'ethernet';
  const style = CONNECTION_STYLE[type];
  const color = type === 'vlan' && firstVlan ? firstVlan.color : style.color;
  const markerId = `arrow-${id}`;

  const parts: string[] = [];
  if (data?.label) parts.push(data.label);
  if (data?.speed && type !== 'logical') parts.push(data.speed);
  const trunk = data?.mode === 'trunk';
  const hasLabel = showLabels && (parts.length > 0 || vlanIds.length > 0 || type === 'vpn');

  return (
    <>
      {type === 'arrow' && (
        <defs>
          <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M1 1 L9 5 L1 9 z" fill={color} />
          </marker>
        </defs>
      )}
      {type === 'fiber' && (
        <path d={path} fill="none" stroke={color} strokeOpacity={0.18} strokeWidth={7} strokeLinecap="round" />
      )}
      <BaseEdge
        id={id}
        path={path}
        className="network-edge-path"
        interactionWidth={18}
        markerEnd={type === 'arrow' ? `url(#${markerId})` : undefined}
        style={{
          stroke: selected ? 'var(--primary)' : color,
          strokeWidth: style.width + (selected ? 0.5 : 0),
          strokeDasharray: style.dash,
          strokeLinecap: 'round',
        }}
      />
      <EdgeLabelRenderer>
        {hasLabel && (
          <div
            className={cn(
              'edge-label nodrag nopan absolute flex items-center gap-1 rounded-md border bg-[var(--edge-label-bg)] px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap text-muted shadow-sm',
              selected ? 'border-primary' : 'border-line',
            )}
            data-edge-id={id}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: 'all' }}
          >
            {type === 'vpn' && <Lock size={9} style={{ color }} />}
            {parts.join(' · ')}
            {vlanIds.length > 0 && (
              <span className="inline-flex items-center gap-0.5 font-semibold" style={{ color: firstVlan?.color }}>
                {parts.length > 0 && <span className="text-subtle">·</span>}
                {trunk ? `trunk ${vlanIds.join(',')}` : `VLAN ${vlanIds.join(',')}`}
              </span>
            )}
            {trunk && vlanIds.length === 0 && <span className="font-semibold text-primary">trunk</span>}
          </div>
        )}
        {showPorts && data?.sourcePort && !crowded(sourceSlot) && (
          <div className="edge-label font-mono text-[9px] text-subtle" data-edge-id={id} style={portLabelStyle(a)}>
            {data.sourcePort}
          </div>
        )}
        {showPorts && data?.targetPort && !crowded(targetSlot) && (
          <div className="edge-label font-mono text-[9px] text-subtle" data-edge-id={id} style={portLabelStyle(b)}>
            {data.targetPort}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}

export const NetworkEdge = memo(NetworkEdgeImpl);
