import type { XYPosition } from '@xyflow/react';
import { getDefinition } from '../../data/catalog';
import type { InfraEdge, InfraNode } from '../../types';
import { formatIPv4, parseCidr, parseIPv4 } from '../../utils/ip';
import { str, uid } from '../../utils/misc';
import { createNode, uniqueName } from './factory';
import { absolutePosition, descendantIds, indexById, nodeSize, sortByHierarchy } from './hierarchy';

export interface ClipboardData {
  /** Root nodes carry absolute positions; nested nodes keep relative ones. */
  nodes: InfraNode[];
  edges: InfraEdge[];
}

/** Selected nodes whose ancestors are not selected (the "roots" of a selection). */
export function selectionRoots(nodes: InfraNode[], selectedIds: Set<string>): InfraNode[] {
  const byId = indexById(nodes);
  return nodes.filter((n) => {
    if (!selectedIds.has(n.id)) return false;
    let p = n.parentId ? byId.get(n.parentId) : undefined;
    while (p) {
      if (selectedIds.has(p.id)) return false;
      p = p.parentId ? byId.get(p.parentId) : undefined;
    }
    return true;
  });
}

export function copyToClipboard(nodes: InfraNode[], edges: InfraEdge[], selectedIds: Set<string>): ClipboardData | null {
  const roots = selectionRoots(nodes, selectedIds);
  if (!roots.length) return null;
  const byId = indexById(nodes);
  const included = new Set<string>();
  for (const r of roots) {
    included.add(r.id);
    for (const d of descendantIds(r.id, nodes)) included.add(d);
  }
  const rootIds = new Set(roots.map((r) => r.id));
  const copied = nodes
    .filter((n) => included.has(n.id))
    .map((n) => (rootIds.has(n.id) ? { ...n, position: absolutePosition(n, byId) } : { ...n }));
  const copiedEdges = edges.filter((e) => included.has(e.source) && included.has(e.target));
  return { nodes: structuredClone(copied), edges: structuredClone(copiedEdges) };
}

function nextFreeIp(ip: string, used: Set<string>): string {
  const n = parseIPv4(ip);
  if (n === null) return ip;
  for (let i = 1; i < 250; i++) {
    const candidate = formatIPv4(n + i);
    if ((n + i) % 256 === 0 || (n + i) % 256 === 255) continue;
    if (!used.has(candidate)) return candidate;
  }
  return ip;
}

export function usedIps(nodes: InfraNode[]): Set<string> {
  return new Set(nodes.map((n) => str(n.data.props.ip)).filter(Boolean));
}

/** First free address of a subnet starting at host .10 (for suggestions). */
export function suggestIp(subnet: string, nodes: InfraNode[]): string {
  const c = parseCidr(subnet);
  if (!c || c.prefix > 28) return '';
  const used = usedIps(nodes);
  const size = 2 ** (32 - c.prefix);
  for (let i = 10; i < size - 1; i++) {
    const ip = formatIPv4(c.network + i);
    if (!used.has(ip)) return ip;
  }
  return '';
}

/**
 * Insert clipboard content. Root nodes are placed at `target` (keeping their
 * relative layout) or offset from their original position.
 */
export function pasteClipboard(
  current: InfraNode[],
  currentEdges: InfraEdge[],
  clip: ClipboardData,
  opts: { offset?: XYPosition; at?: XYPosition; keepParent?: boolean },
): { nodes: InfraNode[]; edges: InfraEdge[]; newIds: string[] } {
  const idMap = new Map<string, string>();
  for (const n of clip.nodes) idMap.set(n.id, uid('n_'));
  const names = new Set(current.map((n) => n.data.name));
  const ips = usedIps(current);
  const byId = indexById(current);

  const roots = clip.nodes.filter((n) => !n.parentId || !idMap.has(n.parentId));
  const minX = Math.min(...roots.map((r) => r.position.x));
  const minY = Math.min(...roots.map((r) => r.position.y));

  const created: InfraNode[] = clip.nodes.map((n) => {
    const isRoot = roots.includes(n);
    const def = getDefinition(n.data.type);
    const named = def.kind === 'device' || def.kind === 'container';
    let name = n.data.name;
    if (named && names.has(name)) name = uniqueName(name.replace(/-\d+$/, ''), names);
    names.add(name);
    const props = { ...n.data.props };
    const ip = str(props.ip);
    if (ip && ips.has(ip)) {
      props.ip = nextFreeIp(ip, ips);
    }
    if (str(props.ip)) ips.add(str(props.ip));

    let position = n.position;
    let parentId = n.parentId ? idMap.get(n.parentId) : undefined;
    if (isRoot) {
      const parent = opts.keepParent && n.parentId ? byId.get(n.parentId) : undefined;
      if (opts.at) position = { x: opts.at.x + (n.position.x - minX), y: opts.at.y + (n.position.y - minY) };
      else position = { x: n.position.x + (opts.offset?.x ?? 32), y: n.position.y + (opts.offset?.y ?? 32) };
      if (parent) {
        const pAbs = absolutePosition(parent, byId);
        position = { x: position.x - pAbs.x, y: position.y - pAbs.y };
        parentId = parent.id;
      }
    }
    const out: InfraNode = {
      ...n,
      id: idMap.get(n.id)!,
      position,
      selected: isRoot,
      data: { ...n.data, name, props, locked: false },
      draggable: undefined,
      deletable: undefined,
    };
    if (parentId) out.parentId = parentId;
    else delete out.parentId;
    return out;
  });

  const newEdges: InfraEdge[] = clip.edges.map((e) => ({
    ...e,
    id: uid('e_'),
    source: idMap.get(e.source)!,
    target: idMap.get(e.target)!,
    selected: false,
    // Ports are physical: do not duplicate them.
    data: e.data ? { ...e.data } : { connType: 'ethernet' },
  }));

  return {
    nodes: sortByHierarchy([...current.map((n) => ({ ...n, selected: false })), ...created]),
    edges: [...currentEdges.map((e) => ({ ...e, selected: false })), ...newEdges],
    newIds: created.filter((n) => n.selected).map((n) => n.id),
  };
}

/** Wrap selected nodes (sharing a parent) in a Group zone. */
export function groupNodes(nodes: InfraNode[], ids: Set<string>): { nodes: InfraNode[]; groupId?: string } {
  const roots = selectionRoots(nodes, ids);
  if (roots.length < 1) return { nodes };
  const parentId = roots[0].parentId;
  const members = roots.filter((r) => r.parentId === parentId);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const m of members) {
    const s = nodeSize(m);
    minX = Math.min(minX, m.position.x);
    minY = Math.min(minY, m.position.y);
    maxX = Math.max(maxX, m.position.x + s.width);
    maxY = Math.max(maxY, m.position.y + s.height);
  }
  const PAD = 24;
  const HEADER = 52;
  const group = createNode('group', {
    position: { x: minX - PAD, y: minY - HEADER },
    parentId,
    size: { width: maxX - minX + PAD * 2, height: maxY - minY + HEADER + PAD },
  });
  group.data.name = 'Group';
  group.selected = true;
  const memberIds = new Set(members.map((m) => m.id));
  const updated = nodes.map((n) =>
    memberIds.has(n.id)
      ? { ...n, parentId: group.id, selected: false, position: { x: n.position.x - group.position.x, y: n.position.y - group.position.y } }
      : { ...n, selected: false },
  );
  return { nodes: sortByHierarchy([...updated, group]), groupId: group.id };
}

/** Remove a container while keeping its children in place. */
export function ungroupNode(nodes: InfraNode[], groupId: string): InfraNode[] {
  const group = nodes.find((n) => n.id === groupId);
  if (!group) return nodes;
  return sortByHierarchy(
    nodes
      .filter((n) => n.id !== groupId)
      .map((n) => {
        if (n.parentId !== groupId) return n;
        const out: InfraNode = {
          ...n,
          selected: true,
          position: { x: n.position.x + group.position.x, y: n.position.y + group.position.y },
        };
        if (group.parentId) out.parentId = group.parentId;
        else delete out.parentId;
        return out;
      }),
  );
}

export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

export function alignNodes(nodes: InfraNode[], ids: Set<string>, mode: AlignMode): InfraNode[] {
  const byId = indexById(nodes);
  const sel = nodes.filter((n) => ids.has(n.id) && !n.data.locked);
  if (sel.length < 2) return nodes;
  const boxes = sel.map((n) => ({ n, abs: absolutePosition(n, byId), s: nodeSize(n) }));
  const left = Math.min(...boxes.map((b) => b.abs.x));
  const right = Math.max(...boxes.map((b) => b.abs.x + b.s.width));
  const top = Math.min(...boxes.map((b) => b.abs.y));
  const bottom = Math.max(...boxes.map((b) => b.abs.y + b.s.height));
  const moved = new Map<string, XYPosition>();
  for (const { n, abs, s } of boxes) {
    let { x, y } = abs;
    if (mode === 'left') x = left;
    if (mode === 'right') x = right - s.width;
    if (mode === 'center') x = (left + right) / 2 - s.width / 2;
    if (mode === 'top') y = top;
    if (mode === 'bottom') y = bottom - s.height;
    if (mode === 'middle') y = (top + bottom) / 2 - s.height / 2;
    moved.set(n.id, { x: x - abs.x, y: y - abs.y });
  }
  return nodes.map((n) => {
    const d = moved.get(n.id);
    return d ? { ...n, position: { x: Math.round(n.position.x + d.x), y: Math.round(n.position.y + d.y) } } : n;
  });
}

export function distributeNodes(nodes: InfraNode[], ids: Set<string>, axis: 'horizontal' | 'vertical'): InfraNode[] {
  const byId = indexById(nodes);
  const sel = nodes.filter((n) => ids.has(n.id) && !n.data.locked);
  if (sel.length < 3) return nodes;
  const key = axis === 'horizontal' ? 'x' : 'y';
  const dim = axis === 'horizontal' ? 'width' : 'height';
  const boxes = sel
    .map((n) => ({ n, abs: absolutePosition(n, byId), s: nodeSize(n) }))
    .sort((a, b) => a.abs[key] - b.abs[key]);
  const start = boxes[0].abs[key];
  const end = boxes[boxes.length - 1].abs[key] + boxes[boxes.length - 1].s[dim];
  const total = boxes.reduce((acc, b) => acc + b.s[dim], 0);
  const gap = (end - start - total) / (boxes.length - 1);
  const moved = new Map<string, number>();
  let cursor = start;
  for (const b of boxes) {
    moved.set(b.n.id, cursor - b.abs[key]);
    cursor += b.s[dim] + gap;
  }
  return nodes.map((n) => {
    const d = moved.get(n.id);
    if (d === undefined) return n;
    return { ...n, position: { ...n.position, [key]: Math.round(n.position[key] + d) } };
  });
}
