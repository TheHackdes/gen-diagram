import type { InfraNode } from '../../types';

/** Information that can be shown on each line of a compact host. */
export const COMPACT_FIELDS = [
  { key: 'type', label: 'Type' },
  { key: 'ip', label: 'IP address' },
  { key: 'moreIps', label: 'Other IPs' },
  { key: 'hostname', label: 'Hostname' },
  { key: 'os', label: 'OS / image' },
  { key: 'resources', label: 'vCPU / RAM' },
  { key: 'ports', label: 'Ports' },
  { key: 'vlan', label: 'VLAN' },
  { key: 'services', label: 'Services' },
  { key: 'description', label: 'Description' },
] as const;

export type CompactField = (typeof COMPACT_FIELDS)[number]['key'];

export const DEFAULT_COMPACT_FIELDS: CompactField[] = ['type', 'ip', 'moreIps', 'os', 'vlan', 'services'];

const KNOWN = new Set<string>(COMPACT_FIELDS.map((f) => f.key));

/** Fields chosen on a compact host (its own choice or the defaults). */
export function compactFieldsOf(host: InfraNode | undefined): CompactField[] {
  const raw = host?.data.props.compactFields;
  return Array.isArray(raw) ? (raw.filter((k) => typeof k === 'string' && KNOWN.has(k)) as CompactField[]) : DEFAULT_COMPACT_FIELDS;
}

/** The outermost compact host above a node decides what its lines show. */
export function compactHostAbove(parentId: string | undefined, nodes: InfraNode[]): InfraNode | undefined {
  let pid = parentId;
  let found: InfraNode | undefined;
  let guard = 0;
  while (pid && guard++ < 20) {
    const p = nodes.find((n) => n.id === pid);
    if (!p) break;
    if (p.data.props.compact === true) found = p;
    pid = p.parentId;
  }
  return found;
}
