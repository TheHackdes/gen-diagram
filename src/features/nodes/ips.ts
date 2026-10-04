import { getDefinition } from '../../data/catalog';
import type { InfraNode, IpEntry } from '../../types';
import { str } from '../../utils/misc';

/** Additional addresses of a node (props.ips), tolerant to malformed data. */
export function extraIps(props: Record<string, unknown>): IpEntry[] {
  const raw = props.ips;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is IpEntry => !!x && typeof x === 'object' && typeof (x as IpEntry).address === 'string')
    .map((x) => ({ address: x.address, label: str(x.label), vlan: str(x.vlan) }));
}

/** Every address of a node: main IP first, then additional ones. */
export function allIps(props: Record<string, unknown>): IpEntry[] {
  const main = str(props.ip);
  return [...(main ? [{ address: main, vlan: str(props.vlan) }] : []), ...extraIps(props)];
}

export const MAX_IP_LINES = 4;
const LINE = 14;

/** Device cards grow to show their additional addresses. */
export function requiredHeight(node: InfraNode): number {
  const def = getDefinition(node.data.type);
  if (def.renderer !== 'device' || def.role === 'docker-container') return def.size.height;
  const n = extraIps(node.data.props).length;
  if (!n) return def.size.height;
  const lines = Math.min(n, MAX_IP_LINES) + (n > MAX_IP_LINES ? 1 : 0);
  return def.size.height + lines * LINE;
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
