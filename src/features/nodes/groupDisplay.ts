import { definitionHasField } from '../../data/catalog';
import type { ComponentDefinition, InfraNode } from '../../types';

/* Header of a group / zone ------------------------------------------- */

/** Items the header of a group / zone can show. */
export const HEADER_FIELDS = [
  { key: 'icon', label: 'Icon' },
  { key: 'vlan', label: 'VLAN' },
  { key: 'name', label: 'Name' },
  { key: 'subnet', label: 'Subnet' },
  { key: 'gateway', label: 'Gateway' },
  { key: 'count', label: 'Member count' },
  { key: 'description', label: 'Description' },
] as const;

export type HeaderField = (typeof HEADER_FIELDS)[number]['key'];

/** What headers showed before the choice existed. */
export const DEFAULT_HEADER_FIELDS: HeaderField[] = ['icon', 'vlan', 'name', 'subnet', 'gateway'];

const HEADER_KEYS = new Set<string>(HEADER_FIELDS.map((f) => f.key));

/** Header items that make sense for this type (a plain group has no VLAN or subnet). */
export function headerOptionsFor(def: ComponentDefinition): (typeof HEADER_FIELDS)[number][] {
  const vlan = definitionHasField(def, 'vlan');
  const network = vlan || definitionHasField(def, 'subnet');
  return HEADER_FIELDS.filter((f) => (f.key === 'vlan' ? vlan : f.key === 'subnet' || f.key === 'gateway' ? network : true));
}

/** Header items chosen on a group (its own choice or the defaults). */
export function headerFieldsOf(node: InfraNode): HeaderField[] {
  const raw = node.data.props.headerFields;
  return Array.isArray(raw) ? (raw.filter((k) => typeof k === 'string' && HEADER_KEYS.has(k)) as HeaderField[]) : DEFAULT_HEADER_FIELDS;
}

/* Cards of the members ----------------------------------------------- */

/** Information the cards inside a group can show (the name is always shown). */
export const CARD_FIELDS = [
  { key: 'ip', label: 'IP addresses' },
  { key: 'subtitle', label: 'Role / product' },
  { key: 'type', label: 'Type badge' },
  { key: 'vlan', label: 'VLAN' },
  { key: 'os', label: 'OS / image' },
  { key: 'ports', label: 'Ports' },
  { key: 'services', label: 'Services' },
  { key: 'details', label: 'VPN / Wi-Fi details' },
] as const;

export type CardField = (typeof CARD_FIELDS)[number]['key'];

export const ALL_CARD_FIELDS: CardField[] = CARD_FIELDS.map((f) => f.key);

const CARD_KEYS = new Set<string>(ALL_CARD_FIELDS);

/** Card information chosen on a group, or undefined when it leaves the choice to its parents. */
export function cardFieldsOf(group: InfraNode | undefined): CardField[] | undefined {
  const raw = group?.data.props.cardFields;
  return Array.isArray(raw) ? (raw.filter((k) => typeof k === 'string' && CARD_KEYS.has(k)) as CardField[]) : undefined;
}

/**
 * The nearest group above a node that chooses what cards show (a sub-group
 * overrides its parents; guests of a host follow the group around the host).
 * Undefined: everything is shown.
 */
export function cardFieldsAbove(parentId: string | undefined, byId: Map<string, InfraNode>): CardField[] | undefined {
  let pid = parentId;
  let guard = 0;
  while (pid && guard++ < 50) {
    const p = byId.get(pid);
    if (!p) break;
    const own = cardFieldsOf(p);
    if (own) return own;
    pid = p.parentId;
  }
  return undefined;
}
