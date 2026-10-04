import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  Position,
  useStore,
  type EdgeProps,
} from '@xyflow/react';
import { Lock } from 'lucide-react';
import { memo } from 'react';
import { linkLabel } from '../../../features/connections/labels';
import { CONNECTION_STYLE } from '../../../features/connections/suggest';
import { useDiagram } from '../../../store/diagramStore';
import type { InfraEdge } from '../../../types';
import { cn } from '../../ui/cn';
import { geometry, isVertical, labelPositions, type Side } from './geometry';

function portLabelStyle(side: Side): React.CSSProperties {
  const t = {
    [Position.Bottom]: `translate(${side.x + 5}px, ${side.y + 4}px)`,
    [Position.Top]: `translate(${side.x + 5}px, ${side.y - 4}px) translateY(-100%)`,
    [Position.Right]: `translate(${side.x + 6}px, ${side.y - 4}px) translateY(-100%)`,
    [Position.Left]: `translate(${side.x - 6}px, ${side.y - 4}px) translate(-100%, -100%)`,
  }[side.pos];
  return { transform: t, position: 'absolute', pointerEvents: 'none' };
}

/** Port tags would overlap when many links share a side; they stay in the properties panel. */
const CROWDED = 3;

function NetworkEdgeImpl({ id, source, target, data, selected }: EdgeProps<InfraEdge>) {
  const geoJson = useStore((st) => {
    const g = geometry(st, id, source, target);
    return g ? JSON.stringify(g) : '';
  });
  const labelAt = useStore((st) => {
    const p = labelPositions(st).get(id);
    return p ? `${Math.round(p.x)},${Math.round(p.y)}` : '';
  });
  const showLabels = useDiagram((st) => st.settings.showEdgeLabels);
  const showPorts = useDiagram((st) => st.settings.showPortLabels);
  const label = useDiagram((st) => {
    const edge = st.edges.find((e) => e.id === id);
    return edge ? linkLabel(edge, st.edges, st.bonds) : '';
  });
  const isLabelOwner = useDiagram((st) => {
    const edge = st.edges.find((e) => e.id === id);
    if (!edge) return false;
    const k = [edge.source, edge.target].sort().join('|');
    const first = st.edges.filter((e) => [e.source, e.target].sort().join('|') === k).sort((p, q) => p.id.localeCompare(q.id))[0];
    return first?.id === id;
  });
  const vlanIds = (data?.vlan ?? '').split(/[\s,]+/).filter(Boolean);
  const firstVlan = useDiagram((st) => (vlanIds.length ? st.vlans.find((v) => String(v.id) === vlanIds[0]) : undefined));
  if (!geoJson) return null;
  const { a, b, shift, aSlots, bSlots, marks } = JSON.parse(geoJson) as NonNullable<ReturnType<typeof geometry>>;

  const vertical = isVertical(a.pos);
  const [path, midX, midY] = getSmoothStepPath({
    sourceX: a.x,
    sourceY: a.y,
    sourcePosition: a.pos,
    targetX: b.x,
    targetY: b.y,
    targetPosition: b.pos,
    centerX: !vertical && shift ? (a.x + b.x) / 2 + shift : undefined,
    centerY: vertical && shift ? (a.y + b.y) / 2 + shift : undefined,
    borderRadius: 10,
    offset: 18,
  });

  const type = data?.connType ?? 'ethernet';
  const style = CONNECTION_STYLE[type];
  const color = type === 'vlan' && firstVlan ? firstVlan.color : style.color;
  const markerId = `arrow-${id}`;
  const trunk = data?.mode === 'trunk';
  // A label on a very short link (stack / peer link) would cover the devices.
  const tooShort = Math.hypot(b.x - a.x, b.y - a.y) < 90;
  // Collision-free position computed for all labels at once (falls back to the middle).
  const [labelX, labelY] = labelAt ? labelAt.split(',').map(Number) : [midX, midY];
  const hasLabel = showLabels && isLabelOwner && !tooShort && (!!label || vlanIds.length > 0 || type === 'vpn');

  return (
    <>
      {type === 'arrow' && (
        <defs>
          <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M1 1 L9 5 L1 9 z" fill={color} />
          </marker>
        </defs>
      )}
      {type === 'fiber' && <path d={path} fill="none" stroke={color} strokeOpacity={0.18} strokeWidth={7} strokeLinecap="round" />}
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
      {marks.map((m, i) => (
        <ellipse key={i} cx={m.x} cy={m.y} rx={m.rx} ry={m.ry} fill="none" stroke={selected ? 'var(--primary)' : color} strokeWidth={1.6} />
      ))}
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
            {label}
            {vlanIds.length > 0 && (
              <span className="inline-flex items-center gap-0.5 font-semibold" style={{ color: firstVlan?.color }}>
                {label && <span className="text-subtle">·</span>}
                {trunk ? `trunk ${vlanIds.join(',')}` : `VLAN ${vlanIds.join(',')}`}
              </span>
            )}
            {trunk && vlanIds.length === 0 && (
              <span className="inline-flex items-center gap-0.5 font-semibold text-primary">
                {label && <span className="text-subtle">·</span>}
                trunk
              </span>
            )}
          </div>
        )}
        {showPorts && data?.sourcePort && aSlots <= CROWDED && (
          <div className="edge-label font-mono text-[9px] text-subtle" data-edge-id={id} style={portLabelStyle(a)}>
            {data.sourcePort}
          </div>
        )}
        {showPorts && data?.targetPort && bSlots <= CROWDED && (
          <div className="edge-label font-mono text-[9px] text-subtle" data-edge-id={id} style={portLabelStyle(b)}>
            {data.targetPort}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}

export const NetworkEdge = memo(NetworkEdgeImpl);
