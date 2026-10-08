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
import { labelIndex } from '../../../features/connections/labels';
import { CONNECTION_STYLE } from '../../../features/connections/suggest';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { useDiagram } from '../../../store/diagramStore';
import { useUi } from '../../../store/uiStore';
import type { InfraEdge, InfraNode } from '../../../types';
import { cn } from '../../ui/cn';
import { hideLinkText } from '../../../features/canvas/lod';
import { geometry, isVertical, labelPositions, type Side } from './geometry';
import { TrafficFlow } from './TrafficFlow';

function portLabelStyle(side: Side): React.CSSProperties {
  const t = {
    [Position.Bottom]: `translate(${side.x + 5}px, ${side.y + 4}px)`,
    [Position.Top]: `translate(${side.x + 5}px, ${side.y - 4}px) translateY(-100%)`,
    [Position.Right]: `translate(${side.x + 6}px, ${side.y - 4}px) translateY(-100%)`,
    [Position.Left]: `translate(${side.x - 6}px, ${side.y - 4}px) translate(-100%, -100%)`,
  }[side.pos];
  return { transform: t, position: 'absolute', pointerEvents: 'none' };
}

type Geometry = NonNullable<ReturnType<typeof geometry>>;
const POS = [Position.Top, Position.Right, Position.Bottom, Position.Left];
const r1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Compact string form of an edge's visual state: the store selector must
 * return a comparable value, and this runs for every link on every frame.
 */
function encodeVisual(g: Geometry, label: { x: number; y: number } | undefined, detailed: boolean): string {
  const parts = [r1(g.a.x), r1(g.a.y), POS.indexOf(g.a.pos), r1(g.b.x), r1(g.b.y), POS.indexOf(g.b.pos), r1(g.shift), g.aSlots, g.bSlots, detailed ? 1 : 0];
  parts.push(label ? Math.round(label.x) : NaN, label ? Math.round(label.y) : NaN);
  for (const m of g.marks) parts.push(r1(m.x), r1(m.y), r1(m.rx), r1(m.ry));
  return parts.join(',');
}

function decodeVisual(v: string): { g: Geometry; l: [number, number] | null; d: boolean } {
  const n = v.split(',').map(Number);
  const marks: Geometry['marks'] = [];
  for (let i = 12; i + 3 < n.length; i += 4) marks.push({ x: n[i], y: n[i + 1], rx: n[i + 2], ry: n[i + 3] });
  return {
    g: { a: { x: n[0], y: n[1], pos: POS[n[2]] }, b: { x: n[3], y: n[4], pos: POS[n[5]] }, shift: n[6], aSlots: n[7], bSlots: n[8], marks },
    d: n[9] === 1,
    l: Number.isNaN(n[10]) ? null : [n[10], n[11]],
  };
}

const selectedBondsCache = new WeakMap<InfraEdge[], Set<string>>();

/** Bonds with a selected member (computed once per change of the links, not per link). */
function selectedBonds(edges: InfraEdge[]): Set<string> {
  let hit = selectedBondsCache.get(edges);
  if (!hit) {
    hit = new Set(edges.filter((e) => e.selected && e.data?.bondId).map((e) => e.data!.bondId!));
    selectedBondsCache.set(edges, hit);
  }
  return hit;
}

const selectedNodesCache = new WeakMap<InfraNode[], Set<string>>();

/** Ids of the selected devices (computed once per change of the nodes). */
function selectedNodes(nodes: InfraNode[]): Set<string> {
  let hit = selectedNodesCache.get(nodes);
  if (!hit) {
    hit = new Set(nodes.filter((n) => n.selected).map((n) => n.id));
    selectedNodesCache.set(nodes, hit);
  }
  return hit;
}

/** Port tags would overlap when many links share a side; they stay in the properties panel. */
const CROWDED = 3;

function NetworkEdgeImpl({ id, source, target, data, selected }: EdgeProps<InfraEdge>) {
  // One subscription per link to the canvas store: geometry, label position and level of detail.
  const visual = useStore((st) => {
    const g = geometry(st, id, source, target);
    if (!g) return '';
    const detailed = !hideLinkText(st.transform[2]);
    const p = detailed ? labelPositions(st).get(id) : undefined;
    return encodeVisual(g, p, detailed);
  });
  // …and one to the project store: what the label says and whether this link draws it.
  const labelKey = useDiagram((st) => {
    const info = labelIndex(st.edges, st.bonds).get(id);
    return `${st.settings.showEdgeLabels ? 1 : 0}${st.settings.showPortLabels ? 1 : 0}${info?.owner ? 1 : 0}${info?.text ?? ''}`;
  });
  const showLabels = labelKey[0] === '1';
  const showPorts = labelKey[1] === '1';
  const isLabelOwner = labelKey[2] === '1';
  const label = labelKey.slice(3);
  const vlanIds = (data?.vlan ?? '').split(/[\s,]+/).filter(Boolean);
  const reducedMotion = useReducedMotion();
  const animate = useUi((st) => st.presentation && st.presentationAnim) && !reducedMotion;
  // Presentation focus (computed by the canvas): 'on' for links of the focused device, 'off' for the others.
  const focus = (data as { _focus?: 'on' | 'off' | 'muted' } | undefined)?._focus;
  // Selecting one member of a bond shows the others (they may join different devices).
  const bondLit = useDiagram((st) => !!data?.bondId && !selected && selectedBonds(st.edges).has(data.bondId));
  // The links of a selected device stand out from the rest (one device, many relations).
  const ofSelected = useDiagram((st) => {
    const sel = selectedNodes(st.nodes);
    return sel.size > 0 && sel.size <= 20 && (sel.has(source) || sel.has(target));
  });
  const firstVlan = useDiagram((st) => (vlanIds.length ? st.vlans.find((v) => String(v.id) === vlanIds[0]) : undefined));
  // Selection highlights are an editing aid: never in exported images.
  const exporting = useUi((st) => st.exporting);
  if (!visual) return null;
  const parsed = decodeVisual(visual);
  const { a, b, shift, aSlots, bSlots, marks } = parsed.g;
  // Level of detail: at a small zoom, text would be unreadable — skip it.
  const detailed = parsed.d;

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
  // 'muted': stepped back by the security view (still readable).
  const dim = focus === 'off' || focus === 'muted';
  const dimOpacity = focus === 'muted' ? 0.3 : 0.12;
  const lit = focus === 'on' || (!exporting && (bondLit || ofSelected));
  const length = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
  const trunk = data?.mode === 'trunk';
  // A label on a very short link (stack / peer link) would cover the devices.
  const tooShort = Math.hypot(b.x - a.x, b.y - a.y) < 90;
  // Collision-free position computed for all labels at once (falls back to the middle).
  const [labelX, labelY] = parsed.l ?? [midX, midY];
  const hasLabel = detailed && showLabels && isLabelOwner && !tooShort && (!!label || vlanIds.length > 0 || type === 'vpn');

  return (
    <>
      {type === 'arrow' && (
        <defs>
          <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M1 1 L9 5 L1 9 z" fill={color} />
          </marker>
        </defs>
      )}
      <g style={{ opacity: dim ? dimOpacity : 1, transition: 'opacity 200ms ease' }}>
      {type === 'fiber' && <path d={path} fill="none" stroke={color} strokeOpacity={0.18} strokeWidth={7} strokeLinecap="round" />}
      {lit && <path d={path} fill="none" stroke={color} strokeOpacity={0.22} strokeWidth={9} strokeLinecap="round" />}
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
      {animate && !dim && <TrafficFlow id={id} path={path} length={length} color={color} data={data} bonded={!!data?.bondId} />}
      </g>
      <EdgeLabelRenderer>
        {hasLabel && (
          <div
            className={cn(
              'edge-label nodrag nopan absolute flex items-center gap-1 rounded-md border bg-[var(--edge-label-bg)] px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap text-muted shadow-sm',
              selected ? 'border-primary' : 'border-line',
            )}
            data-edge-id={id}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: 'all', opacity: dim ? dimOpacity + 0.03 : 1, transition: 'opacity 200ms ease' }}
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
        {detailed && showPorts && !dim && data?.sourcePort && aSlots <= CROWDED && (
          <div className="edge-label font-mono text-[9px] text-subtle" data-edge-id={id} style={portLabelStyle(a)}>
            {data.sourcePort}
          </div>
        )}
        {detailed && showPorts && !dim && data?.targetPort && bSlots <= CROWDED && (
          <div className="edge-label font-mono text-[9px] text-subtle" data-edge-id={id} style={portLabelStyle(b)}>
            {data.targetPort}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}

export const NetworkEdge = memo(NetworkEdgeImpl);
