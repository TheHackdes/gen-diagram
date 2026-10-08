import type { InfraNode, Vlan } from '../../types';
import { cidrEquals, isValidCidr, isValidIPv4 } from '../../utils/ip';
import { nodeIndex } from '../nodes/hierarchy';
import { allIps } from '../nodes/ips';

/**
 * Sources and destinations of firewall rules.
 *
 * Besides "any" and literal addresses (IP, CIDR, alias), a rule can reference
 * objects of the diagram — `vlan:<uid>` or `node:<id>` — that always resolve to
 * the current subnet / addresses, even after a VLAN is renumbered or a device
 * changes address.
 */
export const vlanRef = (v: Vlan) => `vlan:${v.uid}`;
export const nodeRef = (n: InfraNode) => `node:${n.id}`;

export type AddressKind = 'any' | 'vlan' | 'node' | 'literal' | 'missing';

export interface ResolvedAddress {
  kind: AddressKind;
  /** Human name: "any", "VLAN 20 · Servers", "pve-01", or the literal value. */
  label: string;
  /** What it covers: subnet, addresses of the device… */
  detail: string;
}

export const isReference = (value: string) => value.startsWith('vlan:') || value.startsWith('node:');

export function resolveAddress(value: string, nodes: InfraNode[], vlans: Vlan[]): ResolvedAddress {
  const v = value.trim();
  if (!v || v === 'any') return { kind: 'any', label: 'any', detail: '' };
  if (v.startsWith('vlan:')) {
    const vlan = vlans.find((x) => x.uid === v.slice(5));
    return vlan
      ? { kind: 'vlan', label: `VLAN ${vlan.id} · ${vlan.name}`, detail: vlan.subnet ?? '' }
      : { kind: 'missing', label: 'deleted VLAN', detail: '' };
  }
  if (v.startsWith('node:')) {
    const node = nodeIndex(nodes).byId.get(v.slice(5));
    return node
      ? { kind: 'node', label: node.data.name, detail: allIps(node.data.props).map((e) => e.address).filter(Boolean).join(', ') }
      : { kind: 'missing', label: 'deleted device', detail: '' };
  }
  return { kind: 'literal', label: v, detail: '' };
}

/** A literal that could be replaced by a reference (same subnet / device address). */
export function referenceFor(value: string, nodes: InfraNode[], vlans: Vlan[]): { ref: string; label: string } | null {
  const v = value.trim();
  if (isValidCidr(v)) {
    const vlan = vlans.find((x) => !!x.subnet && cidrEquals(x.subnet, v));
    if (vlan) return { ref: vlanRef(vlan), label: `VLAN ${vlan.id} · ${vlan.name}` };
  }
  if (isValidIPv4(v)) {
    const node = nodes.find((n) => allIps(n.data.props).some((e) => e.address === v));
    if (node) return { ref: nodeRef(node), label: node.data.name };
  }
  return null;
}

/** Replace node references after a copy (old id → new id). */
export function remapNodeRefs(value: string, idMap: Map<string, string>): string {
  if (!value.startsWith('node:')) return value;
  const next = idMap.get(value.slice(5));
  return next ? `node:${next}` : value;
}

/** Text of an address for tables and summaries: the object's name, or the literal. */
export function addressText(value: string, nodes: InfraNode[], vlans: Vlan[]): string {
  return resolveAddress(value, nodes, vlans).label;
}

/** The problem of a reference that no longer points to anything. */
export function referenceProblem(value: string, nodes: InfraNode[], vlans: Vlan[]): string | null {
  const r = resolveAddress(value, nodes, vlans);
  return r.kind === 'missing' ? `refers to a ${r.label}` : null;
}
