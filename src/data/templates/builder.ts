import { suggestConnection } from '../../features/connections/suggest';
import { autoLayout } from '../../features/layout/autoLayout';
import { createNode } from '../../features/nodes/factory';
import { sortByHierarchy } from '../../features/nodes/hierarchy';
import type { InfraEdge, InfraEdgeData, InfraNode, LayoutAlgorithm, Vlan } from '../../types';
import { uid } from '../../utils/misc';

export const VLAN_COLORS = ['#8b5cf6', '#2563eb', '#059669', '#d97706', '#dc2626', '#0891b2', '#db2777', '#64748b'];

/** Small DSL used to write templates without coordinates; positions come from auto-layout. */
export class TemplateBuilder {
  nodes: InfraNode[] = [];
  edges: InfraEdge[] = [];
  vlans: Vlan[] = [];

  vlan(id: number, name: string, subnet: string, color: string, description = ''): this {
    const gateway = subnet.replace(/\.0\/\d+$/, '.1');
    this.vlans.push({ uid: uid('v_'), id, name, subnet, gateway, color, description });
    return this;
  }

  add(type: string, name: string, props: Record<string, unknown> = {}, parent?: string): string {
    const node = createNode(type, { position: { x: 0, y: 0 }, parentId: parent, props });
    node.data.name = name;
    this.nodes.push(node);
    return node.id;
  }

  /** Zone bound to a VLAN declared with `vlan()`. */
  vlanZone(vlanId: number, parent?: string): string {
    const v = this.vlans.find((x) => x.id === vlanId);
    const type = v?.name.toLowerCase() === 'dmz' ? 'dmz' : 'vlan-zone';
    return this.add(type, v?.name ?? `VLAN ${vlanId}`, { vlan: String(vlanId) }, parent);
  }

  link(a: string, b: string, overrides: Partial<InfraEdgeData> = {}): this {
    const source = this.nodes.find((n) => n.id === a)!;
    const target = this.nodes.find((n) => n.id === b)!;
    const data = { ...suggestConnection(source, target, this.edges, overrides.connType), ...overrides };
    this.edges.push({ id: uid('e_'), type: 'network', source: a, target: b, data });
    return this;
  }

  build(algorithm: LayoutAlgorithm = 'network') {
    const nodes = autoLayout(sortByHierarchy(this.nodes), this.edges, algorithm);
    return { nodes, edges: this.edges, vlans: this.vlans };
  }
}
