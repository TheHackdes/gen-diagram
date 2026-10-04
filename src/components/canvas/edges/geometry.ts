import { Position, type InternalNode, type ReactFlowState } from '@xyflow/react';
import { linkLabel } from '../../../features/connections/labels';
import { useDiagram } from '../../../store/diagramStore';
import type { InfraEdge, InfraNode } from '../../../types';

/*
 * Link geometry shared by the edge renderer and the label placer: which side of
 * a device a link leaves from, how links sharing a side are spread, where they
 * bend, and where their labels go without overlapping.
 */

export interface Side {
  x: number;
  y: number;
  pos: Position;
}

type Node = InternalNode<InfraNode>;

export function box(n: Node) {
  const { x, y } = n.internals.positionAbsolute;
  const w = n.measured.width ?? n.width ?? 0;
  const h = n.measured.height ?? n.height ?? 0;
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
}

export const isVertical = (p: Position) => p === Position.Top || p === Position.Bottom;

/** Pick the facing sides of two nodes so links always leave from the closest edge. */
export function floatingSides(a: Node, b: Node): [Side, Side] {
  const A = box(a);
  const B = box(b);
  const dx = B.cx - A.cx;
  const dy = B.cy - A.cy;
  // Prefer vertical routing unless nodes are clearly side by side.
  const overlapY = A.y < B.y + B.h && B.y < A.y + A.h;
  const horizontal = overlapY || Math.abs(dx) / (A.w / 2 + B.w / 2) > (Math.abs(dy) / (A.h / 2 + B.h / 2)) * 1.6;
  if (horizontal) {
    return dx >= 0
      ? [{ x: A.x + A.w, y: A.cy, pos: Position.Right }, { x: B.x, y: B.cy, pos: Position.Left }]
      : [{ x: A.x, y: A.cy, pos: Position.Left }, { x: B.x + B.w, y: B.cy, pos: Position.Right }];
  }
  return dy >= 0
    ? [{ x: A.cx, y: A.y + A.h, pos: Position.Bottom }, { x: B.cx, y: B.y, pos: Position.Top }]
    : [{ x: A.cx, y: A.y, pos: Position.Top }, { x: B.cx, y: B.y + B.h, pos: Position.Bottom }];
}

interface Endpoint {
  edge: InfraEdge;
  side: Side;
  /** Position of the far node along the side axis (orders endpoints). */
  key: number;
  index: number;
  count: number;
  point: Side;
}

/**
 * Where every link attaches on a node: links sharing a side are spread along it,
 * ordered by the position of their far end so they never cross near the node.
 */
function endpointsOf(s: ReactFlowState, nodeId: string): Endpoint[] {
  const self = s.nodeLookup.get(nodeId) as Node | undefined;
  if (!self) return [];
  const b = box(self);
  const items: Omit<Endpoint, 'index' | 'count' | 'point'>[] = [];
  for (const e of s.edges as InfraEdge[]) {
    if (e.source !== nodeId && e.target !== nodeId) continue;
    const other = s.nodeLookup.get(e.source === nodeId ? e.target : e.source) as Node | undefined;
    if (!other) continue;
    const [side] = floatingSides(self, other);
    const o = box(other);
    items.push({ edge: e, side, key: isVertical(side.pos) ? o.cx : o.cy });
  }
  const out: Endpoint[] = [];
  for (const pos of [Position.Top, Position.Right, Position.Bottom, Position.Left]) {
    const same = items.filter((i) => i.side.pos === pos).sort((p, q) => p.key - q.key || p.edge.id.localeCompare(q.edge.id));
    const count = same.length;
    const length = isVertical(pos) ? b.w : b.h;
    const span = count > 1 ? Math.min(length * 0.75, (count - 1) * (count <= 3 ? 56 : 22)) : 0;
    same.forEach((it, index) => {
      const offset = count > 1 ? -span / 2 + (index * span) / (count - 1) : 0;
      const point = isVertical(pos) ? { ...it.side, x: it.side.x + offset } : { ...it.side, y: it.side.y + offset };
      out.push({ ...it, index, count, point });
    });
  }
  return out;
}

/**
 * Fan-out without overlaps: links leaving one side towards the same direction
 * bend at staggered distances (the outermost link bends first), so their
 * horizontal (or vertical) runs never sit on top of each other or cross.
 */
function bendShift(mine: Endpoint, all: Endpoint[], self: Node): number {
  const b = box(self);
  const centre = isVertical(mine.side.pos) ? b.cx : b.cy;
  const sameSide = all.filter((e) => e.side.pos === mine.side.pos);
  // Links heading to the left (or up) of the node vs to the right (or down).
  const before = (e: Endpoint) => e.key < centre;
  const group = sameSide.filter((e) => before(e) === before(mine));
  // Outer first: ascending for the "before" group, descending for the "after" group.
  group.sort((p, q) => (before(mine) ? p.key - q.key || p.edge.id.localeCompare(q.edge.id) : q.key - p.key || q.edge.id.localeCompare(p.edge.id)));
  const rank = group.findIndex((e) => e.edge.id === mine.edge.id);
  if (group.length < 2 || rank < 0) return 0;
  const outward = mine.side.pos === Position.Bottom || mine.side.pos === Position.Right ? 1 : -1;
  return outward * (rank - (group.length - 1) / 2) * 10;
}

export interface Geometry {
  a: Side;
  b: Side;
  shift: number;
  aSlots: number;
  bSlots: number;
  /** Bond ellipses this link draws (it is the first member at that node side). */
  marks: { x: number; y: number; rx: number; ry: number }[];
}

export function geometry(s: ReactFlowState, id: string, source: string, target: string): Geometry | null {
  const src = s.nodeLookup.get(source) as Node | undefined;
  const tgt = s.nodeLookup.get(target) as Node | undefined;
  if (!src || !tgt) return null;
  const atSource = endpointsOf(s, source);
  const atTarget = endpointsOf(s, target);
  const a = atSource.find((e) => e.edge.id === id);
  const b = atTarget.find((e) => e.edge.id === id);
  if (!a || !b) return null;
  const marks: Geometry['marks'] = [];
  const bondId = a.edge.data?.bondId;
  if (bondId) {
    for (const end of [a, b]) {
      const list = end === a ? atSource : atTarget;
      const members = list.filter((e) => e.edge.data?.bondId === bondId && e.side.pos === end.side.pos);
      if (members.length < 2 || members.sort((p, q) => p.edge.id.localeCompare(q.edge.id))[0].edge.id !== id) continue;
      const vertical = isVertical(end.side.pos);
      const coords = members.map((m) => (vertical ? m.point.x : m.point.y));
      const lo = Math.min(...coords);
      const hi = Math.max(...coords);
      const out = end.side.pos === Position.Bottom || end.side.pos === Position.Right ? 26 : -26;
      marks.push(
        vertical
          ? { x: (lo + hi) / 2, y: end.point.y + out, rx: (hi - lo) / 2 + 9, ry: 5 }
          : { x: end.point.x + out, y: (lo + hi) / 2, rx: 5, ry: (hi - lo) / 2 + 9 },
      );
    }
  }
  return { a: a.point, b: b.point, shift: bendShift(a, atSource, src), aSlots: a.count, bSlots: b.count, marks };
}


/* ------------------------------------------------------------------ */
/* Label placement                                                     */
/* ------------------------------------------------------------------ */

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const overlaps = (a: Rect, b: Rect, m = 3) => a.x - m < b.x + b.w && b.x - m < a.x + a.w && a.y - m < b.y + b.h && b.y - m < a.y + a.h;

/** Approximate polyline of the smooth-step path drawn for a link. */
function polyline(g: Geometry): [number, number][][] {
  const { a, b, shift } = g;
  if (isVertical(a.pos)) {
    const cy = (a.y + b.y) / 2 + shift;
    return [[[a.x, a.y], [a.x, cy]], [[a.x, cy], [b.x, cy]], [[b.x, cy], [b.x, b.y]]];
  }
  const cx = (a.x + b.x) / 2 + shift;
  return [[[a.x, a.y], [cx, a.y]], [[cx, a.y], [cx, b.y]], [[cx, b.y], [b.x, b.y]]];
}

const OBSTACLES = new Set(['device', 'text', 'title', 'note', 'legend', 'rulesTable', 'separator', 'arrow']);
const cache = new WeakMap<ReactFlowState, { diagram: unknown; result: Map<string, { x: number; y: number }> }>();

/**
 * Greedy placement of every link label: try the middle of the link, then other
 * points along it, keeping the first spot that covers neither another label
 * nor a device card. Computed once per canvas state for all links.
 */
export function labelPositions(s: ReactFlowState): Map<string, { x: number; y: number }> {
  const diagram = useDiagram.getState();
  const hit = cache.get(s);
  if (hit && hit.diagram === diagram) return hit.result;
  const result = new Map<string, { x: number; y: number }>();
  if (diagram.settings.showEdgeLabels) {
    const obstacles: Rect[] = [];
    for (const n of s.nodeLookup.values()) {
      if (!OBSTACLES.has(n.type ?? '')) continue;
      const b = box(n as Node);
      obstacles.push({ x: b.x, y: b.y, w: b.w, h: b.h });
    }
    const placed: Rect[] = [];
    const edges = (s.edges as InfraEdge[]).slice().sort((p, q) => p.id.localeCompare(q.id));
    for (const e of edges) {
      const data = diagram.edges.find((x) => x.id === e.id);
      if (!data) continue;
      const text = linkLabel(data, diagram.edges, diagram.bonds);
      const vlan = (data.data?.vlan ?? '').split(/[\s,]+/).filter(Boolean);
      const extra = vlan.length ? `${data.data?.mode === 'trunk' ? ' · trunk ' : ' · VLAN '}${vlan.join(',')}` : data.data?.mode === 'trunk' ? ' · trunk' : '';
      if (!text && !extra && data.data?.connType !== 'vpn') continue;
      // Only the first link of a bundle carries the label.
      const k = [e.source, e.target].sort().join('|');
      if (edges.find((x) => [x.source, x.target].sort().join('|') === k)?.id !== e.id) continue;
      const g = geometry(s, e.id, e.source, e.target);
      if (!g || Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y) < 90) continue;
      const w = (text + extra).length * 5.4 + 16 + (data.data?.connType === 'vpn' ? 12 : 0);
      const h = 18;
      const [first, middle, last] = polyline(g);
      const candidates: [number, number][] = [];
      for (const [seg, fractions] of [
        [middle, [0.5, 0.3, 0.7, 0.15, 0.85]],
        [last, [0.5, 0.3, 0.7]],
        [first, [0.5, 0.7]],
      ] as const) {
        const [[x1, y1], [x2, y2]] = seg;
        for (const f of fractions) candidates.push([x1 + (x2 - x1) * f, y1 + (y2 - y1) * f]);
      }
      let chosen = candidates[0];
      for (const c of candidates) {
        const r = { x: c[0] - w / 2, y: c[1] - h / 2, w, h };
        if (!placed.some((p) => overlaps(p, r)) && !obstacles.some((o) => overlaps(o, r, 0))) {
          chosen = c;
          break;
        }
      }
      placed.push({ x: chosen[0] - w / 2, y: chosen[1] - h / 2, w, h });
      result.set(e.id, { x: chosen[0], y: chosen[1] });
    }
  }
  cache.set(s, { diagram, result });
  return result;
}
