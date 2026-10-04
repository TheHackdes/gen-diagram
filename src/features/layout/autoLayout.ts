import { graphlib, layout as dagreLayout } from '@dagrejs/dagre';
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force';
import type { SimulationLinkDatum, SimulationNodeDatum } from 'd3-force';
import { CATEGORIES } from '../../data/categories';
import { getDefinition, isContainerDef } from '../../data/catalog';
import type { InfraEdge, InfraNode, LayoutAlgorithm, NodeRole } from '../../types';
import { nodeSize, sortByHierarchy } from '../nodes/hierarchy';
import { childTop, COMPACT_ROW, isCompactHost, requiredHeight } from '../nodes/ips';
import { str } from '../../utils/misc';

export const LAYOUT_ALGORITHMS: { id: LayoutAlgorithm; label: string; description: string }[] = [
  { id: 'network', label: 'Network', description: 'Top-down from Internet to endpoints, by device tier.' },
  { id: 'hierarchical', label: 'Hierarchical', description: 'Layered top-down layout following link direction.' },
  { id: 'tree', label: 'Tree', description: 'Left-to-right tree, compact.' },
  { id: 'force', label: 'Force directed', description: 'Organic layout, good for meshes.' },
  { id: 'grid', label: 'Grid', description: 'Tidy grid grouped by category.' },
];

const PAD = 24;
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
  /** Nodes whose size was set by the layout (containers, compact rows, reset rows). */
  resized: Set<string>;
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
  const group = (id: string) => str(ctx.nodes.find((n) => n.id === id)?.data.props.redundancyGroup).trim();
  for (const e of ctx.edges) {
    const a = ancestorUnder(e.source, parentId, ctx);
    const b = ancestorUnder(e.target, parentId, ctx);
    if (!a || !b || a === b || !ids.has(a) || !ids.has(b)) continue;
    // Peer links inside a stack / MLAG / HA pair keep both peers on the same rank.
    if (group(a) && group(a) === group(b)) continue;
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

const COMPACT_PAD = 10;
const COMPACT_GAP = 4;
const COMPACT_MIN_WIDTH = 360;

/**
 * Compact host: every guest is a full-width line, stacked in their current
 * vertical order (so dragging a line up or down reorders it). Nested hosts
 * (a Docker host in Proxmox) become compact blocks with their own lines.
 */
function compactLayout(parent: InfraNode, ctx: Ctx, width: number, nested: boolean): number {
  const kids = (ctx.children.get(parent.id) ?? [])
    .slice()
    .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
  const rowWidth = width - COMPACT_PAD * 2;
  let y = childTop(parent, nested);
  for (const k of kids) {
    const def = getDefinition(k.data.type);
    const height = def.kind === 'container' || (ctx.children.get(k.id)?.length ?? 0) > 0 ? compactLayout(k, ctx, rowWidth, true) : COMPACT_ROW;
    ctx.sizes.set(k.id, { width: rowWidth, height });
    ctx.resized.add(k.id);
    ctx.positions.set(k.id, { x: COMPACT_PAD, y });
    y += height + COMPACT_GAP;
  }
  const height = kids.length ? y - COMPACT_GAP + COMPACT_PAD : childTop(parent, nested) + (nested ? 6 : 60);
  ctx.sizes.set(parent.id, { width, height });
  ctx.resized.add(parent.id);
  return height;
}

/** Guests leaving compact view get their normal card size back. */
function restoreCardSize(k: InfraNode, ctx: Ctx): void {
  const def = getDefinition(k.data.type);
  if (def.kind !== 'device' || nodeSize(k).height > COMPACT_ROW) return;
  ctx.sizes.set(k.id, { width: def.size.width, height: requiredHeight(k) });
  ctx.resized.add(k.id);
}

/** Lay out the children of a container, returning the container's new size. */
function layoutContainer(parent: InfraNode, ctx: Ctx, byId: Map<string, InfraNode>): void {
  const kids = ctx.children.get(parent.id) ?? [];
  if (isCompactHost(parent)) {
    compactLayout(parent, ctx, Math.max(nodeSize(parent).width, COMPACT_MIN_WIDTH), false);
    return;
  }
  if (!kids.length) {
    ctx.sizes.set(parent.id, nodeSize(parent));
    return;
  }
  for (const k of kids) restoreCardSize(k, ctx);
  for (const k of kids) if (ctx.children.get(k.id)?.length) layoutContainer(k, ctx, byId);
  const ids = new Set(kids.map((k) => k.id));
  const pairs = orientByTier(localEdges(parent.id, ids, ctx), ctx, byId);
  const sorted = sortForGrid(kids);
  const local =
    pairs.length > 0 && ctx.algorithm !== 'grid'
      ? runDagre(sorted, pairs, ctx, { rankdir: 'TB', nodesep: GAP + 8, ranksep: 44 })
      : runShelf(sorted, ctx, GAP);

  const top = childTop(parent);
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
    ctx.positions.set(k.id, { x: Math.round(p.x - minX + PAD), y: Math.round(p.y - minY + top) });
  }
  ctx.sizes.set(parent.id, {
    width: Math.round(Math.max(260, maxX - minX + PAD * 2)),
    height: Math.round(Math.max(140, maxY - minY + top + PAD)),
  });
  ctx.resized.add(parent.id);
}

function buildCtx(nodes: InfraNode[], edges: InfraEdge[], algorithm: LayoutAlgorithm): Ctx {
  const ctx: Ctx = { nodes, edges, algorithm, sizes: new Map(), positions: new Map(), children: new Map(), parentOf: new Map(), resized: new Set() };
  for (const n of nodes) {
    ctx.parentOf.set(n.id, n.parentId);
    const list = ctx.children.get(n.parentId) ?? [];
    list.push(n);
    ctx.children.set(n.parentId, list);
    ctx.sizes.set(n.id, nodeSize(n));
  }
  return ctx;
}

function applyCtx(nodes: InfraNode[], ctx: Ctx): InfraNode[] {
  return nodes.map((n) => {
    const pos = ctx.positions.get(n.id);
    const resized = ctx.resized.has(n.id);
    if (!pos && !resized) return n;
    const next: InfraNode = { ...n, position: pos ?? n.position };
    if (resized) {
      const size = ctx.sizes.get(n.id)!;
      next.width = size.width;
      next.height = size.height;
      next.measured = undefined;
    }
    return next;
  });
}

/** Re-arrange the inside of one host (after toggling compact view, adding or moving guests…). */
export function relayoutContainer(nodes: InfraNode[], edges: InfraEdge[], id: string): InfraNode[] {
  const ctx = buildCtx(nodes, edges, 'network');
  const node = nodes.find((n) => n.id === id);
  if (!node) return nodes;
  layoutContainer(node, ctx, new Map(nodes.map((n) => [n.id, n])));
  return sortByHierarchy(applyCtx(nodes, ctx));
}

/**
 * Re-arrange the diagram. Containers are laid out bottom-up (children grid or
 * mini-dagre), then the top level is arranged with the selected algorithm.
 */
export function autoLayout(nodes: InfraNode[], edges: InfraEdge[], algorithm: LayoutAlgorithm): InfraNode[] {
  const ctx = buildCtx(nodes, edges, algorithm);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  // Locked nodes keep their place; their children too.
  const top = (ctx.children.get(undefined) ?? []).filter((n) => !isFloatingAnnotation(n));
  for (const n of top) if (ctx.children.get(n.id)?.length) layoutContainer(n, ctx, byId);
  const movable = top.filter((n) => !n.data.locked);
  const ids = new Set(movable.map((n) => n.id));

  // A stack / MLAG pair / HA cluster is laid out as one block, members side by side.
  const PEER_GAP = 40;
  const blocks = new Map<string, InfraNode[]>();
  for (const n of movable) {
    const g = str(n.data.props.redundancyGroup).trim();
    if (g) blocks.set(g, [...(blocks.get(g) ?? []), n]);
  }
  const alias = new Map<string, string>();
  // Ungrouped nodes now; groups (or single-member groups) are added below.
  const items: InfraNode[] = movable.filter((n) => !str(n.data.props.redundancyGroup).trim());
  for (const [g, members] of blocks) {
    if (members.length < 2) {
      items.push(members[0]);
      continue;
    }
    members.sort((a, b) => a.data.name.localeCompare(b.data.name));
    const id = `group:${g}`;
    for (const m of members) alias.set(m.id, id);
    const sizes = members.map((m) => ctx.sizes.get(m.id)!);
    ctx.sizes.set(id, {
      width: sizes.reduce((acc, z) => acc + z.width, 0) + PEER_GAP * (members.length - 1),
      height: Math.max(...sizes.map((z) => z.height)),
    });
    items.push({ ...members[0], id, position: members[0].position });
  }
  const toItem = (pairs: [string, string][]): [string, string][] => {
    const seen = new Set<string>();
    const out: [string, string][] = [];
    for (const [a, b] of pairs) {
      const x = alias.get(a) ?? a;
      const y = alias.get(b) ?? b;
      if (x === y || seen.has(`${x}>${y}`)) continue;
      seen.add(`${x}>${y}`);
      out.push([x, y]);
    }
    return out;
  };
  const rawPairs = localEdges(undefined, ids, ctx);
  const tiered = toItem(orientByTier(rawPairs, ctx, byId));

  let placed: Map<string, { x: number; y: number }>;
  switch (algorithm) {
    case 'hierarchical':
      placed = runDagre(items, toItem(rawPairs), ctx, { rankdir: 'TB', nodesep: 56, ranksep: 96 });
      break;
    case 'network':
      placed = runDagre(items, tiered, ctx, { rankdir: 'TB', nodesep: 56, ranksep: 96 });
      break;
    case 'tree':
      placed = runDagre(items, tiered, ctx, { rankdir: 'LR', nodesep: 32, ranksep: 110, ranker: 'tight-tree' });
      break;
    case 'force':
      placed = runForce(items, toItem(rawPairs), ctx);
      break;
    case 'grid':
    default:
      placed = runShelf(sortForGrid(items), ctx, 56);
  }
  // Expand blocks back into their members.
  for (const [g, members] of blocks) {
    const id = `group:${g}`;
    const p = placed.get(id);
    if (!p) continue;
    placed.delete(id);
    const height = ctx.sizes.get(id)!.height;
    let x = p.x;
    for (const m of members) {
      const sz = ctx.sizes.get(m.id)!;
      placed.set(m.id, { x, y: p.y + (height - sz.height) / 2 });
      x += sz.width + PEER_GAP;
    }
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
  const others = floating.filter((n) => n.data.type !== 'title' && n.data.type !== 'fw-table');
  // Firewall rule tables are docked on the right by dockTables().
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

  const result = applyCtx(nodes, ctx);
  return sortByHierarchy(dockTables(result));
}

/* ------------------------------------------------------------------ */
/* Firewall rule tables docked on the right                            */
/* ------------------------------------------------------------------ */

const DOCK_GAP = 64;

/** Tables that follow the right edge of the diagram (default for rule tables). */
export const isDockedTable = (n: InfraNode) => n.data.type === 'fw-table' && !n.parentId && n.data.props.dock !== false;

/**
 * Keep firewall rule tables to the right of everything else, stacked from the
 * top of the diagram. Returns the same array when nothing moves.
 */
export function dockTables(nodes: InfraNode[]): InfraNode[] {
  const changes = new Map<string, Partial<InfraNode>>();
  // Undocked tables become draggable again.
  for (const n of nodes)
    if (n.data.type === 'fw-table' && !isDockedTable(n) && n.draggable === false && !n.data.locked) changes.set(n.id, { draggable: undefined });
  const tables = nodes.filter(isDockedTable);
  const rest = nodes.filter((n) => !n.parentId && !isDockedTable(n));
  if (tables.length && rest.length) {
    let right = -Infinity;
    let top = Infinity;
    for (const n of rest) {
      right = Math.max(right, n.position.x + nodeSize(n).width);
      top = Math.min(top, n.position.y);
    }
    let y = top;
    for (const t of tables.slice().sort((a, b) => a.position.y - b.position.y || a.id.localeCompare(b.id))) {
      const p = { x: Math.round(right + DOCK_GAP), y: Math.round(y) };
      const patch: Partial<InfraNode> = {};
      if (Math.abs(t.position.x - p.x) > 0.5 || Math.abs(t.position.y - p.y) > 0.5) patch.position = p;
      // A docked table cannot be dragged away: it would fight the docking.
      if (t.draggable !== false) patch.draggable = false;
      if (Object.keys(patch).length) changes.set(t.id, patch);
      y += nodeSize(t).height + 32;
    }
  }
  if (!changes.size) return nodes;
  return nodes.map((n) => (changes.has(n.id) ? { ...n, ...changes.get(n.id) } : n));
}
