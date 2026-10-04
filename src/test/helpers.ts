import { createNode } from '../features/nodes/factory';
import type { Bond, BondModeId, InfraEdge, InfraEdgeData, InfraNode } from '../types';

let n = 0;

export function node(type: string, name: string, props: Record<string, unknown> = {}, parentId?: string): InfraNode {
  const node = createNode(type, { position: { x: n * 300, y: 0 }, props, parentId });
  n++;
  node.id = name;
  node.data.name = name;
  return node;
}

export function edge(id: string, source: string, target: string, data: Partial<InfraEdgeData> = {}): InfraEdge {
  return { id, type: 'network', source, target, data: { connType: 'ethernet', speed: '10 Gbps', ...data } };
}

export function bond(id: string, mode: BondModeId, members: InfraEdge[], name = id): Bond {
  for (const e of members) e.data = { ...e.data!, bondId: id };
  return { id, name, mode };
}
