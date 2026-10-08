import { getDefinition } from '../../data/catalog';
import type { InfraEdge, InfraNode, IpEntry } from '../../types';
import { str } from '../../utils/misc';
import { servicesOf } from '../../data/services';
import { isArranged } from './arrange';
import { cardFieldsAbove, type CardField } from './groupDisplay';
import { detailLines } from './details';

/** Additional addresses of a node (props.ips), tolerant to malformed data. */
export function extraIps(props: Record<string, unknown>): IpEntry[] {
  const raw = props.ips;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is IpEntry => !!x && typeof x === 'object' && typeof (x as IpEntry).address === 'string')
    .map((x) => ({ address: x.address, label: str(x.label), vlan: str(x.vlan), show: x.show !== false }));
}

/** Does the card show a badge row (integrated services or extra roles)? */
export function hasBadges(props: Record<string, unknown>): boolean {
  return props.fw === true || props.vpn === true || props.wifi === true || servicesOf(props).length > 0;
}

/**
 * The addresses of a node as one uniform list (address, interface, VLAN,
 * visibility). Storage keeps the first one in props.ip / ipLabel / vlan /
 * ipHidden — read by cards, links and validation — and the others in props.ips.
 */
export function addressEntries(props: Record<string, unknown>): IpEntry[] {
  const address = str(props.ip);
  const label = str(props.ipLabel);
  const vlan = str(props.vlan);
  const head = address || label || vlan ? [{ address, label, vlan, show: props.ipHidden !== true }] : [];
  return [...head, ...extraIps(props)];
}

export function entriesPatch(entries: IpEntry[]): Record<string, unknown> {
  const [first, ...rest] = entries;
  return {
    ip: first?.address ?? '',
    ipLabel: first?.label ?? '',
    vlan: first?.vlan ?? '',
    ipHidden: first ? first.show === false : false,
    ips: rest,
  };
}

const SWITCHING_ROLES = new Set(['switch', 'core-switch']);

/** Interface name suggested for the n-th address of a node. */
export function defaultInterface(node: InfraNode, index: number, vlan: string): string {
  const def = getDefinition(node.data.type);
  // Switches carry their addresses on VLAN interfaces (SVIs).
  if (SWITCHING_ROLES.has(def.role)) return vlan ? `Vlan${vlan}` : `mgmt${index}`;
  return def.portPattern ? def.portPattern(index) : `eth${index}`;
}

/** Interface of an address: its name, or the default name of its position. */
export function interfaceName(node: InfraNode, entry: IpEntry, index: number): string {
  return (entry.label ?? '').trim() || defaultInterface(node, index, entry.vlan ?? '');
}

/** "bond0.99" → { parent: "bond0", vlan: "99" }: a tagged VLAN sub-interface. */
export function subInterface(name: string): { parent: string; vlan: string } | null {
  const m = name.match(/^(.*\S)\.(\d{1,4})$/);
  return m ? { parent: m[1], vlan: m[2] } : null;
}

export interface DeclaredInterface {
  /** Interface name as declared in the address list (eth0, vmbr0…). */
  name: string;
  /** Its addresses (an interface may carry several). */
  addresses: string[];
  /** VLAN of its first address. */
  vlan: string;
  /** Link plugged into it, if any: the link, the device on the other end and its port. */
  link?: { edgeId: string; peer: string; peerPort: string };
}

/**
 * Interfaces a device declares in its address list, with the link mapped to
 * each one (a link port named like the interface).
 */
export function interfacesOf(node: InfraNode, edges: InfraEdge[]): DeclaredInterface[] {
  const out = new Map<string, DeclaredInterface>();
  addressEntries(node.data.props).forEach((e, i) => {
    // An address without interface name sits on the default one (shown as placeholder in the editor).
    const name = interfaceName(node, e, i);
    if (!name) return;
    const it = out.get(name) ?? { name, addresses: [], vlan: e.vlan ?? '' };
    if (e.address) it.addresses.push(e.address);
    out.set(name, it);
  });
  for (const e of edges) {
    if (e.data?.connType === 'arrow' || e.data?.connType === 'logical') continue;
    const mine = e.source === node.id ? e.data?.sourcePort : e.target === node.id ? e.data?.targetPort : undefined;
    const it = mine ? out.get(mine) : undefined;
    if (it && !it.link)
      it.link = { edgeId: e.id, peer: e.source === node.id ? e.target : e.source, peerPort: (e.source === node.id ? e.data?.targetPort : e.data?.sourcePort) ?? '' };
  }
  return [...out.values()];
}

/** Addresses displayed on the diagram — all alike, in list order. */
export function shownAddresses(props: Record<string, unknown>): IpEntry[] {
  return addressEntries(props).filter((e) => e.address && e.show !== false);
}

/** Addresses the user chose to hide on the diagram. */
export function hiddenAddressCount(props: Record<string, unknown>): number {
  return addressEntries(props).filter((e) => e.address && e.show === false).length;
}

/** Number of address lines drawn on a card or host header. */
function addressLines(props: Record<string, unknown>): number {
  const n = shownAddresses(props).length;
  return Math.min(n, MAX_IP_LINES) + (n > MAX_IP_LINES ? 1 : 0);
}

/** Every address of a node: main IP first, then additional ones. */
export function allIps(props: Record<string, unknown>): IpEntry[] {
  const main = str(props.ip);
  return [...(main ? [{ address: main, vlan: str(props.vlan) }] : []), ...extraIps(props)];
}

export const MAX_IP_LINES = 4;
const LINE = 14;
const BADGE_ROW = 20;

/**
 * Device cards grow to show their additional addresses. `show` is what the
 * group around the card lets it display (undefined: everything).
 */
export function requiredHeight(node: InfraNode, show?: readonly CardField[]): number {
  const def = getDefinition(node.data.type);
  if (def.renderer !== 'device' || def.role === 'docker-container') return def.size.height;
  const has = (k: CardField) => !show || show.includes(k);
  // The base card has one line under the name (role, or the first address line).
  const lines = has('ip') ? Math.max(0, addressLines(node.data.props) - 1) : 0;
  const details = has('details') ? detailLines(node.data.props).length : 0;
  return def.size.height + (lines + details) * LINE + (has('services') && hasBadges(node.data.props) ? BADGE_ROW : 0);
}

/**
 * What a host header shows: the fields chosen by the group around it — given
 * directly, or found from the node index — or everything.
 */
export type HeaderContext = Map<string, InfraNode> | readonly CardField[] | undefined;

function shownIn(node: InfraNode, context: HeaderContext): readonly CardField[] | undefined {
  return context instanceof Map ? cardFieldsAbove(node.parentId, context) : context;
}

/**
 * Height of the header of a host (hypervisor, Docker host): one line per
 * displayed address or service detail, so addresses are stacked, not inlined.
 * Lines hidden by the group around the host do not take room.
 */
export function headerHeight(node: InfraNode, context?: HeaderContext): number {
  const def = getDefinition(node.data.type);
  if (def.renderer === 'zone') return 44;
  if (def.renderer !== 'container') return 0;
  const show = shownIn(node, context);
  const has = (k: CardField) => !show || show.includes(k);
  return 48 + ((has('ip') ? addressLines(node.data.props) : 0) + (has('details') ? detailLines(node.data.props).length : 0)) * LINE;
}

/* Compact view of hosts --------------------------------------------- */

/** Height of a guest drawn as a single line in a compact host. */
export const COMPACT_ROW = 30;
/** Header of a host drawn inside a compact host (e.g. a Docker host in Proxmox). */
export const COMPACT_HEADER = 30;
/** Default width of a host switched to compact view. */
export const COMPACT_WIDTH = 440;

export const isCompactHost = (n: InfraNode | undefined): boolean => !!n && n.data.props.compact === true;

/** Is this node inside a host shown in compact view (at any depth)? */
export function inCompactHost(node: InfraNode, byId: Map<string, InfraNode>): boolean {
  let p = node.parentId ? byId.get(node.parentId) : undefined;
  let guard = 0;
  while (p && guard++ < 50) {
    if (isCompactHost(p)) return true;
    p = p.parentId ? byId.get(p.parentId) : undefined;
  }
  return false;
}

/** A container whose members are placed by the app (compact lines or an arranged group). */
export const isManaged = (n: InfraNode | undefined): boolean => isCompactHost(n) || isArranged(n);

/**
 * Containers to re-arrange, innermost first, after something changed in or on
 * `nodeId`: the outermost compact host above it (it lays out all its levels)
 * and the arranged groups above that.
 */
export function managedAncestors(nodeId: string, byId: Map<string, InfraNode>): InfraNode[] {
  const chain: InfraNode[] = [];
  let cur = byId.get(nodeId);
  let guard = 0;
  while (cur && guard++ < 50) {
    chain.push(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  let root = -1;
  chain.forEach((n, i) => {
    if (isCompactHost(n)) root = i;
  });
  return chain.filter((n, i) => i === root || (i > root && isArranged(n)));
}

/** Top offset of the children of a container. */
export function childTop(node: InfraNode, compactRow = false, context?: HeaderContext): number {
  if (compactRow) return COMPACT_HEADER + 4;
  return headerHeight(node, context) + (isCompactHost(node) ? 8 : 12);
}

/** Adjust a device's height after its address list (or what its group shows) changed. */
export function fitDeviceHeight(node: InfraNode, show?: readonly CardField[]): InfraNode {
  const def = getDefinition(node.data.type);
  if (def.renderer !== 'device' || def.role === 'docker-container') return node;
  const height = requiredHeight(node, show);
  return node.height === height ? node : { ...node, height, measured: undefined };
}

/** Does this node run a VPN gateway (dedicated appliance or integrated)? */
export function hasVpn(node: InfraNode): boolean {
  return getDefinition(node.data.type).role === 'vpn' || node.data.props.vpn === true;
}

export function hasHostFirewall(node: InfraNode): boolean {
  return node.data.props.fw === true;
}

/** Access point: dedicated AP or equipment with integrated Wi-Fi (e.g. a router). */
export function hasWifi(node: InfraNode): boolean {
  return getDefinition(node.data.type).role === 'ap' || node.data.props.wifi === true;
}
