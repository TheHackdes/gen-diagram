import type { XYPosition } from '@xyflow/react';
import { canContain, getDefinition } from '../../data/catalog';
import type { InfraNode } from '../../types';
import { inCompactHost, isManaged } from './ips';

export function nodeSize(n: InfraNode): { width: number; height: number } {
  const def = getDefinition(n.data.type);
  return {
    width: n.measured?.width ?? n.width ?? def.size.width,
    height: n.measured?.height ?? n.height ?? def.size.height,
  };
}

export function indexById(nodes: InfraNode[]): Map<string, InfraNode> {
  return new Map(nodes.map((n) => [n.id, n]));
}

export function absolutePosition(node: InfraNode, byId: Map<string, InfraNode>): XYPosition {
  let x = node.position.x;
  let y = node.position.y;
  let parent = node.parentId ? byId.get(node.parentId) : undefined;
  let guard = 0;
  while (parent && guard++ < 50) {
    x += parent.position.x;
    y += parent.position.y;
    parent = parent.parentId ? byId.get(parent.parentId) : undefined;
  }
  return { x, y };
}

export function depthOf(node: InfraNode, byId: Map<string, InfraNode>): number {
  let d = 0;
  let p = node.parentId ? byId.get(node.parentId) : undefined;
  while (p && d < 50) {
    d++;
    p = p.parentId ? byId.get(p.parentId) : undefined;
  }
  return d;
}

/** React Flow requires parents to appear before their children. */
export function sortByHierarchy(nodes: InfraNode[]): InfraNode[] {
  const byId = indexById(nodes);
  return nodes
    .map((n, i) => ({ n, i, d: depthOf(n, byId) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .map((x) => x.n);
}

export function descendantIds(id: string, nodes: InfraNode[]): Set<string> {
  const out = new Set<string>();
  let frontier = [id];
  while (frontier.length) {
    const next: string[] = [];
    for (const n of nodes) {
      if (n.parentId && frontier.includes(n.parentId) && !out.has(n.id)) {
        out.add(n.id);
        next.push(n.id);
      }
    }
    frontier = next;
  }
  return out;
}

export function childrenOf(id: string | undefined, nodes: InfraNode[]): InfraNode[] {
  return nodes.filter((n) => n.parentId === id);
}

/** The deepest container at `point` that accepts `childType`. */
export function findContainerAt(
  point: XYPosition,
  nodes: InfraNode[],
  childType: string,
  excluded: Set<string> = new Set(),
): InfraNode | undefined {
  const byId = indexById(nodes);
  let best: { n: InfraNode; depth: number; area: number } | undefined;
  for (const n of nodes) {
    if (excluded.has(n.id)) continue;
    if (!canContain(n.data.type, childType)) continue;
    const pos = absolutePosition(n, byId);
    const { width, height } = nodeSize(n);
    if (point.x < pos.x || point.y < pos.y || point.x > pos.x + width || point.y > pos.y + height) continue;
    const depth = depthOf(n, byId);
    const area = width * height;
    if (!best || depth > best.depth || (depth === best.depth && area < best.area)) best = { n, depth, area };
  }
  return best?.n;
}

/** Move `nodeId` under `parentId` (or to the root) keeping its absolute position. */
export function reparentNode(nodes: InfraNode[], nodeId: string, parentId: string | undefined): InfraNode[] {
  const byId = indexById(nodes);
  const node = byId.get(nodeId);
  if (!node || node.parentId === parentId) return nodes;
  const abs = absolutePosition(node, byId);
  let position = abs;
  if (parentId) {
    const parent = byId.get(parentId);
    if (!parent) return nodes;
    const pAbs = absolutePosition(parent, byId);
    position = { x: abs.x - pAbs.x, y: abs.y - pAbs.y };
  }
  const updated: InfraNode = { ...node, position, parentId };
  if (!parentId) delete updated.parentId;
  return sortByHierarchy(nodes.map((n) => (n.id === nodeId ? updated : n)));
}

/** Grow containers so that their children fit (after a drop or layout). */
export function fitContainersToChildren(nodes: InfraNode[], padding = 20): InfraNode[] {
  const result = nodes.slice();
  const byIdx = new Map(result.map((n, i) => [n.id, i]));
  // Process deepest first so growth propagates upwards.
  const byId = indexById(result);
  const order = result
    .filter((n) => result.some((c) => c.parentId === n.id))
    .sort((a, b) => depthOf(b, byId) - depthOf(a, byId));
  for (const parent of order) {
    // Compact hosts and arranged groups size themselves (see relayoutContainer).
    if (isManaged(parent) || inCompactHost(parent, byId)) continue;
    const idx = byIdx.get(parent.id)!;
    const current = result[idx];
    const kids = result.filter((c) => c.parentId === parent.id);
    let maxX = 0;
    let maxY = 0;
    for (const k of kids) {
      const s = nodeSize(k);
      maxX = Math.max(maxX, k.position.x + s.width);
      maxY = Math.max(maxY, k.position.y + s.height);
    }
    const size = nodeSize(current);
    const width = Math.max(size.width, maxX + padding);
    const height = Math.max(size.height, maxY + padding);
    if (width !== size.width || height !== size.height) {
      result[idx] = { ...current, width, height, measured: undefined };
    }
  }
  return result;
}

/**
 * Shrink the containers around `id` (zones, hosts) to their content without
 * moving anything — used when a host gets smaller, e.g. in compact view.
 */
export function shrinkAncestors(nodes: InfraNode[], id: string, padding = 24): InfraNode[] {
  let result = nodes;
  let byId = indexById(result);
  let parentId = byId.get(id)?.parentId;
  let guard = 0;
  while (parentId && guard++ < 50) {
    const parent = byId.get(parentId);
    if (!parent || isManaged(parent) || inCompactHost(parent, byId)) break;
    const kids = result.filter((n) => n.parentId === parentId);
    if (!kids.length) break;
    let maxX = 0;
    let maxY = 0;
    for (const k of kids) {
      const s = nodeSize(k);
      maxX = Math.max(maxX, k.position.x + s.width);
      maxY = Math.max(maxY, k.position.y + s.height);
    }
    const width = Math.max(200, maxX + padding);
    const height = Math.max(120, maxY + padding);
    const size = nodeSize(parent);
    if (width < size.width || height < size.height) {
      const updated = { ...parent, width: Math.min(size.width, width), height: Math.min(size.height, height), measured: undefined };
      result = result.map((n) => (n.id === parentId ? updated : n));
      byId = indexById(result);
    }
    parentId = parent.parentId;
  }
  return result;
}

interface NodeIndex {
  byId: Map<string, InfraNode>;
  childCount: Map<string, number>;
}
const nodeIndexCache = new WeakMap<InfraNode[], NodeIndex>();

/** Lookups shared by all canvas components for one version of the node list. */
export function nodeIndex(nodes: InfraNode[]): NodeIndex {
  let idx = nodeIndexCache.get(nodes);
  if (idx) return idx;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const childCount = new Map<string, number>();
  for (const n of nodes) if (n.parentId) childCount.set(n.parentId, (childCount.get(n.parentId) ?? 0) + 1);
  idx = { byId, childCount };
  nodeIndexCache.set(nodes, idx);
  return idx;
}
