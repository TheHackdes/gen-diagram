import { graphlib, layout as dagreLayout } from '@dagrejs/dagre';
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force';
import type { SimulationLinkDatum, SimulationNodeDatum } from 'd3-force';
import { CATEGORIES } from '../../data/categories';
import { getDefinition, isContainerDef } from '../../data/catalog';
import type { InfraEdge, InfraNode, LayoutAlgorithm, NodeRole } from '../../types';
import { nodeSize, sortByHierarchy } from '../nodes/hierarchy';

export const LAYOUT_ALGORITHMS: { id: LayoutAlgorithm; label: string; description: string }[] = [
  { id: 'network', label: 'Network', description: 'Top-down from Internet to endpoints, by device tier.' },
  { id: 'hierarchical', label: 'Hierarchical', description: 'Layered top-down layout following link direction.' },
  { id: 'tree', label: 'Tree', description: 'Left-to-right tree, compact.' },
  { id: 'force', label: 'Force directed', description: 'Organic layout, good for meshes.' },
  { id: 'grid', label: 'Grid', description: 'Tidy grid grouped by category.' },
];

const PAD = 24;
const HEADER = 60;
const GAP = 20;

/** Lower tiers are placed closer to the top (Internet first, endpoints last). */
const TIER: Record<NodeRole, number> = {
  wan: 0,
  cloud: 0,
  router: 1,
  vpn: 2,
  firewall: 2,
  security: 3,
  'load-balancer': 4,
  'core-switch': 4,
  switch: 5,
  ap: 6,
  bridge: 6,
  hypervisor: 7,
  server: 7,
  'docker-host': 7,
  storage: 8,
  vm: 8,
  lxc: 8,
  'docker-container': 9,
  endpoint: 9,
  zone: 99,
  group: 99,
  annotation: 99,
};

type Size = { width: number; height: number };

interface Ctx {
  nodes: InfraNode[];
  edges: InfraEdge[];
  algorithm: LayoutAlgorithm;
  sizes: Map<string, Size>;
  positions: Map<string, { x: number; y: number }>;
  children: Map<string | undefined, InfraNode[]>;
  parentOf: Map<string, string | undefined>;
}

const isFloatingAnnotation = (n: InfraNode) => {
  const def = getDefinition(n.data.type);
  return def.kind === 'annotation' && !isContainerDef(def);
};

function tierOf(n: InfraNode, ctx: Ctx): number {
  const def = getDefinition(n.data.type);
  const own = TIER[def.role];
  const kids = ctx.children.get(n.id) ?? [];
  const inner = kids.reduce((min, k) => Math.min(min, tierOf(k, ctx)), own);
  // Zones hang below the switching/routing layer unless they contain the edge itself.
  return def.kind === 'zone' && inner > TIER.firewall ? Math.max(inner, TIER.ap) : inner;
}

/** Map each node id to its ancestor that is a direct child of `parentId`. */
function ancestorUnder(id: string, parentId: string | undefined, ctx: Ctx): string | undefined {
  let current: string | undefined = id;
  let guard = 0;
  while (current !== undefined && guard++ < 50) {
    const p = ctx.parentOf.get(current);
    if (p === parentId) return current;
    current = p;
  }
  return undefined;
}

function localEdges(parentId: string | undefined, ids: Set<string>, ctx: Ctx): [string, string][] {
  const seen = new Set<string>();
  const out: [string, string][] = [];
  for (const e of ctx.edges) {
    const a = ancestorUnder(e.source, parentId, ctx);
    const b = ancestorUnder(e.target, parentId, ctx);
    if (!a || !b || a === b || !ids.has(a) || !ids.has(b)) continue;
    const key = `${a}->${b}`;
    if (seen.has(key) || seen.has(`${b}->${a}`)) continue;
    seen.add(key);
    out.push([a, b]);
  }
  return out;
}

function orientByTier(pairs: [string, string][], ctx: Ctx, byId: Map<string, InfraNode>): [string, string][] {
  return pairs.map(([a, b]) => {
    const ta = tierOf(byId.get(a)!, ctx);
    const tb = tierOf(byId.get(b)!, ctx);
    return ta > tb ? [b, a] : [a, b];
  });
}

function runDagre(
  items: InfraNode[],
  pairs: [string, string][],
  ctx: Ctx,
  opts: { rankdir: 'TB' | 'LR'; nodesep: number; ranksep: number; ranker?: string },
): Map<string, { x: number; y: number }> {
  const g = new graphlib.Graph();
  g.setGraph({ rankdir: opts.rankdir, nodesep: opts.nodesep, ranksep: opts.ranksep, ranker: opts.ranker ?? 'network-simplex' });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of items) {
    const s = ctx.sizes.get(n.id)!;
    g.setNode(n.id, { width: s.width, height: s.height });
  }
  for (const [a, b] of pairs) g.setEdge(a, b);
  dagreLayout(g);
  const out = new Map<string, { x: number; y: number }>();
  for (const n of items) {
    const p = g.node(n.id) as { x: number; y: number };
    const s = ctx.sizes.get(n.id)!;
    out.set(n.id, { x: p.x - s.width / 2, y: p.y - s.height / 2 });
  }
  return out;
}

function runShelf(items: InfraNode[], ctx: Ctx, gap: number, preferredCols?: number): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  if (!items.length) return out;
  const widths = items.map((n) => ctx.sizes.get(n.id)!.width);
  const cols = preferredCols ?? (items.length <= 3 ? items.length : Math.ceil(Math.sqrt(items.length * 1.5)));
  const avg = widths.reduce((a, b) => a + b, 0) / items.length;
  const limit = Math.max(Math.max(...widths), cols * (avg + gap) - gap);
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const n of items) {
    const s = ctx.sizes.get(n.id)!;
    if (x > 0 && x + s.width > limit + 1) {
      x = 0;
      y += rowH + gap;
      rowH = 0;
    }
    out.set(n.id, { x, y });
    x += s.width + gap;
    rowH = Math.max(rowH, s.height);
  }
  return out;
}

function runForce(items: InfraNode[], pairs: [string, string][], ctx: Ctx): Map<string, { x: number; y: number }> {
  type SimNode = SimulationNodeDatum & { id: string; r: number };
  const simNodes: SimNode[] = items.map((n, i) => {
    const s = ctx.sizes.get(n.id)!;
    const angle = (i / items.length) * Math.PI * 2;
    return {
      id: n.id,
      r: Math.hypot(s.width, s.height) / 2 + 30,
      x: n.position.x + s.width / 2 || Math.cos(angle) * 300,
      y: n.position.y + s.height / 2 || Math.sin(angle) * 300,
    };
  });
  const links: SimulationLinkDatum<SimNode>[] = pairs.map(([a, b]) => ({ source: a, target: b }));
  const sim = forceSimulation(simNodes)
    .force('link', forceLink<SimNode, SimulationLinkDatum<SimNode>>(links).id((d) => d.id).distance((l) => {
      const s = l.source as SimNode;
      const t = l.target as SimNode;
      return s.r + t.r + 40;
    }).strength(0.6))
    .force('charge', forceManyBody().strength(-900))
    .force('collide', forceCollide<SimNode>().radius((d) => d.r).iterations(3))
    .force('x', forceX(0).strength(0.04))
    .force('y', forceY(0).strength(0.04))
    .stop();
  for (let i = 0; i < 400; i++) sim.tick();
  const out = new Map<string, { x: number; y: number }>();
  for (const sn of simNodes) {
    const s = ctx.sizes.get(sn.id)!;
    out.set(sn.id, { x: (sn.x ?? 0) - s.width / 2, y: (sn.y ?? 0) - s.height / 2 });
  }
  return out;
}

function sortForGrid(items: InfraNode[]): InfraNode[] {
  const catOrder = new Map(CATEGORIES.map((c, i) => [c.id, i]));
  return items.slice().sort((a, b) => {
    const da = getDefinition(a.data.type);
    const db = getDefinition(b.data.type);
    const ca = isContainerDef(da) ? 1 : 0;
    const cb = isContainerDef(db) ? 1 : 0;
    return (
      ca - cb ||
      TIER[da.role] - TIER[db.role] ||
      (catOrder.get(da.category) ?? 0) - (catOrder.get(db.category) ?? 0) ||
      a.data.name.localeCompare(b.data.name)
    );
  });
}

/** Lay out the children of a container, returning the container's new size. */
function layoutContainer(parent: InfraNode, ctx: Ctx, byId: Map<string, InfraNode>): void {
  const kids = ctx.children.get(parent.id) ?? [];
  if (!kids.length) {
    ctx.sizes.set(parent.id, nodeSize(parent));
    return;
  }
  for (const k of kids) if (ctx.children.get(k.id)?.length) layoutContainer(k, ctx, byId);
  const ids = new Set(kids.map((k) => k.id));
  const pairs = orientByTier(localEdges(parent.id, ids, ctx), ctx, byId);
  const sorted = sortForGrid(kids);
  const local =
    pairs.length > 0 && ctx.algorithm !== 'grid'
      ? runDagre(sorted, pairs, ctx, { rankdir: 'TB', nodesep: GAP + 8, ranksep: 44 })
      : runShelf(sorted, ctx, GAP);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const k of kids) {
    const p = local.get(k.id)!;
    const s = ctx.sizes.get(k.id)!;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + s.width);
    maxY = Math.max(maxY, p.y + s.height);
  }
  for (const k of kids) {
    const p = local.get(k.id)!;
    ctx.positions.set(k.id, { x: Math.round(p.x - minX + PAD), y: Math.round(p.y - minY + HEADER) });
  }
  ctx.sizes.set(parent.id, {
    width: Math.round(Math.max(260, maxX - minX + PAD * 2)),
    height: Math.round(Math.max(140, maxY - minY + HEADER + PAD)),
  });
}

/**
 * Re-arrange the diagram. Containers are laid out bottom-up (children grid or
 * mini-dagre), then the top level is arranged with the selected algorithm.
 */
export function autoLayout(nodes: InfraNode[], edges: InfraEdge[], algorithm: LayoutAlgorithm): InfraNode[] {
  const ctx: Ctx = {
    nodes,
    edges,
    algorithm,
    sizes: new Map(),
    positions: new Map(),
    children: new Map(),
    parentOf: new Map(),
  };
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const n of nodes) {
    ctx.parentOf.set(n.id, n.parentId);
    const list = ctx.children.get(n.parentId) ?? [];
    list.push(n);
    ctx.children.set(n.parentId, list);
    ctx.sizes.set(n.id, nodeSize(n));
  }
  // Locked nodes keep their place; their children too.
  const top = (ctx.children.get(undefined) ?? []).filter((n) => !isFloatingAnnotation(n));
  for (const n of top) if (ctx.children.get(n.id)?.length) layoutContainer(n, ctx, byId);
  const movable = top.filter((n) => !n.data.locked);
  const ids = new Set(movable.map((n) => n.id));
  const rawPairs = localEdges(undefined, ids, ctx);

  let placed: Map<string, { x: number; y: number }>;
  switch (algorithm) {
    case 'hierarchical':
      placed = runDagre(movable, rawPairs, ctx, { rankdir: 'TB', nodesep: 56, ranksep: 96 });
      break;
    case 'network':
      placed = runDagre(movable, orientByTier(rawPairs, ctx, byId), ctx, { rankdir: 'TB', nodesep: 56, ranksep: 96 });
      break;
    case 'tree':
      placed = runDagre(movable, orientByTier(rawPairs, ctx, byId), ctx, {
        rankdir: 'LR',
        nodesep: 32,
        ranksep: 110,
        ranker: 'tight-tree',
      });
      break;
    case 'force':
      placed = runForce(movable, rawPairs, ctx);
      break;
    case 'grid':
    default:
      placed = runShelf(sortForGrid(movable), ctx, 56);
  }

  // Normalize to the origin of the previous diagram.
  const origin = movable.reduce(
    (o, n) => ({ x: Math.min(o.x, n.position.x), y: Math.min(o.y, n.position.y) }),
    { x: Infinity, y: Infinity },
  );
  const ox = Number.isFinite(origin.x) ? origin.x : 0;
  const oy = Number.isFinite(origin.y) ? origin.y : 0;
  let minX = Infinity;
  let minY = Infinity;
  for (const p of placed.values()) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
  }
  let maxX = -Infinity;
  let topY = Infinity;
  for (const [id, p] of placed) {
    const pos = { x: Math.round(p.x - minX + ox), y: Math.round(p.y - minY + oy) };
    ctx.positions.set(id, pos);
    maxX = Math.max(maxX, pos.x + ctx.sizes.get(id)!.width);
    topY = Math.min(topY, pos.y);
  }

  // Floating annotations: titles above the diagram, the rest in a right column.
  const floating = (ctx.children.get(undefined) ?? []).filter((n) => isFloatingAnnotation(n) && !n.data.locked);
  const titles = floating.filter((n) => n.data.type === 'title');
  const others = floating.filter((n) => n.data.type !== 'title');
  let ty = (Number.isFinite(topY) ? topY : 0) - 24;
  for (const t of titles.slice().reverse()) {
    const s = ctx.sizes.get(t.id)!;
    ty -= s.height;
    ctx.positions.set(t.id, { x: ox, y: ty });
    ty -= 8;
  }
  let cy = Number.isFinite(topY) ? topY : 0;
  const cx = (Number.isFinite(maxX) ? maxX : 0) + 64;
  for (const o of others) {
    ctx.positions.set(o.id, { x: cx, y: cy });
    cy += ctx.sizes.get(o.id)!.height + 24;
  }

  const result = nodes.map((n) => {
    const pos = ctx.positions.get(n.id);
    const size = ctx.sizes.get(n.id)!;
    const isParent = (ctx.children.get(n.id)?.length ?? 0) > 0;
    if (!pos && !isParent) return n;
    const next: InfraNode = { ...n, position: pos ?? n.position };
    if (isParent) {
      next.width = size.width;
      next.height = size.height;
    }
    return next;
  });
  return sortByHierarchy(result);
}
