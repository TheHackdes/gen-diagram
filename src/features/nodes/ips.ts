import { getDefinition } from '../../data/catalog';
import type { InfraNode, IpEntry } from '../../types';
import { str } from '../../utils/misc';
import { servicesOf } from '../../data/services';
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

/** Device cards grow to show their additional addresses. */
export function requiredHeight(node: InfraNode): number {
  const def = getDefinition(node.data.type);
  if (def.renderer !== 'device' || def.role === 'docker-container') return def.size.height;
  // The base card has one line under the name (role, or the first address line).
  const lines = Math.max(0, addressLines(node.data.props) - 1);
  return def.size.height + (lines + detailLines(node.data.props).length) * LINE + (hasBadges(node.data.props) ? BADGE_ROW : 0);
}

/**
 * Height of the header of a host (hypervisor, Docker host): one line per
 * displayed address or service detail, so addresses are stacked, not inlined.
 */
export function headerHeight(node: InfraNode): number {
  const def = getDefinition(node.data.type);
  if (def.renderer === 'zone') return 44;
  if (def.renderer !== 'container') return 0;
  return 48 + (addressLines(node.data.props) + detailLines(node.data.props).length) * LINE;
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

/** Outermost compact host containing (or being) this node. */
export function compactRoot(nodeId: string, byId: Map<string, InfraNode>): InfraNode | undefined {
  let cur = byId.get(nodeId);
  let found: InfraNode | undefined;
  let guard = 0;
  while (cur && guard++ < 50) {
    if (isCompactHost(cur)) found = cur;
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return found;
}

/** Top offset of the children of a container. */
export function childTop(node: InfraNode, compactRow = false): number {
  if (compactRow) return COMPACT_HEADER + 4;
  return headerHeight(node) + (isCompactHost(node) ? 8 : 12);
}

/** Adjust a device's height after its address list changed. */
export function fitDeviceHeight(node: InfraNode): InfraNode {
  const def = getDefinition(node.data.type);
  if (def.renderer !== 'device' || def.role === 'docker-container') return node;
  const height = requiredHeight(node);
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
