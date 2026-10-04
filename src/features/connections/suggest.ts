import { getDefinition } from '../../data/catalog';
import type { ConnectionType, InfraEdge, InfraEdgeData, InfraNode, NodeRole } from '../../types';
import { str } from '../../utils/misc';
import { hasVpn } from '../nodes/ips';

const SWITCHING: NodeRole[] = ['switch', 'core-switch'];
const INFRA_TRUNK: NodeRole[] = ['switch', 'core-switch', 'router', 'firewall', 'hypervisor', 'ap', 'bridge'];
const WIRELESS_CLIENTS = new Set(['laptop', 'smartphone', 'iot', 'camera', 'phone']);
const GUESTS: NodeRole[] = ['vm', 'lxc', 'docker-container', 'docker-host', 'bridge'];

export const CONNECTION_TYPES: { id: ConnectionType; label: string; color: string; dash?: string; width: number }[] = [
  { id: 'ethernet', label: 'Ethernet', color: '#64748b', width: 1.75 },
  { id: 'fiber', label: 'Fiber', color: '#f97316', width: 2.5 },
  { id: 'wifi', label: 'Wi-Fi', color: '#0ea5e9', dash: '2 5', width: 2 },
  { id: 'vpn', label: 'VPN tunnel', color: '#10b981', dash: '8 5', width: 2 },
  { id: 'wan', label: 'WAN', color: '#8b5cf6', width: 2.5 },
  { id: 'vlan', label: 'VLAN / trunk', color: '#2563eb', width: 2.5 },
  { id: 'logical', label: 'Logical', color: '#94a3b8', dash: '1 5', width: 2 },
  { id: 'generic', label: 'Generic link', color: '#64748b', width: 1.5 },
  { id: 'arrow', label: 'Arrow (annotation)', color: '#64748b', width: 1.5 },
];

export const CONNECTION_STYLE = Object.fromEntries(CONNECTION_TYPES.map((c) => [c.id, c])) as Record<
  ConnectionType,
  (typeof CONNECTION_TYPES)[number]
>;

function usedPorts(nodeId: string, edges: InfraEdge[]): Set<string> {
  const used = new Set<string>();
  for (const e of edges) {
    if (e.source === nodeId && e.data?.sourcePort) used.add(e.data.sourcePort);
    if (e.target === nodeId && e.data?.targetPort) used.add(e.data.targetPort);
  }
  return used;
}

/** Next free interface name for a node (eth0, Gi1/0/3…). */
export function nextPort(node: InfraNode, edges: InfraEdge[]): string {
  const def = getDefinition(node.data.type);
  if (!def.portPattern) return '';
  const used = usedPorts(node.id, edges);
  for (let i = 0; i < 512; i++) {
    const p = def.portPattern(i);
    if (!used.has(p)) return p;
  }
  return '';
}

function inferType(a: InfraNode, b: InfraNode): ConnectionType {
  const ra = getDefinition(a.data.type).role;
  const rb = getDefinition(b.data.type).role;
  const roles = [ra, rb];
  const has = (r: NodeRole) => roles.includes(r);

  if (a.data.type === 'arrow' || b.data.type === 'arrow') return 'arrow';
  if (getDefinition(a.data.type).kind === 'annotation' || getDefinition(b.data.type).kind === 'annotation') return 'arrow';
  // Two VPN-capable ends (dedicated gateway or router/firewall with integrated VPN) → tunnel.
  if (hasVpn(a) && hasVpn(b)) return 'vpn';
  if (has('vpn') && (has('wan') || has('cloud'))) return 'vpn';
  if (has('wan') || has('cloud')) return 'wan';
  if (has('ap') && (WIRELESS_CLIENTS.has(a.data.type) || WIRELESS_CLIENTS.has(b.data.type))) return 'wifi';
  if (a.data.type === 'san' || b.data.type === 'san') return 'fiber';
  if (SWITCHING.includes(ra) && SWITCHING.includes(rb)) return 'fiber';
  if (GUESTS.includes(ra) && GUESTS.includes(rb)) return 'logical';
  if (has('zone') || has('group')) return 'logical';
  return 'ethernet';
}

/**
 * Smart defaults for a new link, e.g. Server → Switch gives
 * Ethernet · 1 Gbps · eth0 ↔ Gi1/0/1 · access VLAN of the server.
 */
export function suggestConnection(
  source: InfraNode,
  target: InfraNode,
  edges: InfraEdge[],
  forcedType?: ConnectionType,
): InfraEdgeData {
  const connType = forcedType ?? inferType(source, target);
  const data: InfraEdgeData = { connType };
  if (connType === 'logical' || connType === 'arrow' || connType === 'generic') return data;

  const rs = getDefinition(source.data.type).role;
  const rt = getDefinition(target.data.type).role;

  if (connType === 'vpn') {
    // A tunnel lands on a virtual interface, not on a physical port.
    const tunnelIf = (n: InfraNode) => {
      const proto = str(n.data.props.vpnProtocol) || str(n.data.props.protocol);
      return proto === 'WireGuard' ? 'wg0' : proto === 'OpenVPN' ? 'tun0' : proto ? 'ipsec0' : '';
    };
    if (hasVpn(source)) data.sourcePort = tunnelIf(source);
    if (hasVpn(target)) data.targetPort = tunnelIf(target);
    const proto = str(source.data.props.vpnProtocol) || str(target.data.props.vpnProtocol) || str(source.data.props.protocol) || str(target.data.props.protocol);
    if (proto) data.label = proto;
    return data;
  }
  if (connType !== 'wan') {
    data.sourcePort = nextPort(source, edges);
    data.targetPort = nextPort(target, edges);
  } else {
    // Only the local equipment gets a port; the Internet/cloud side has none.
    if (rs !== 'wan' && rs !== 'cloud') data.sourcePort = nextPort(source, edges);
    if (rt !== 'wan' && rt !== 'cloud') data.targetPort = nextPort(target, edges);
  }

  if (connType === 'fiber') data.speed = '10 Gbps';
  else if (connType === 'ethernet') {
    const storage = rs === 'storage' || rt === 'storage' || rs === 'hypervisor' || rt === 'hypervisor';
    data.speed = storage ? '10 Gbps' : '1 Gbps';
  } else if (connType === 'wifi') data.speed = 'Wi-Fi 6';

  const bothInfra = INFRA_TRUNK.includes(rs) && INFRA_TRUNK.includes(rt);
  if (bothInfra && (SWITCHING.includes(rs) || SWITCHING.includes(rt))) {
    data.mode = 'trunk';
  } else if (SWITCHING.includes(rs) || SWITCHING.includes(rt)) {
    const endpoint = SWITCHING.includes(rs) ? target : source;
    const vlan = str(endpoint.data.props.vlan);
    data.mode = 'access';
    if (vlan) data.vlan = vlan;
  }
  return data;
}
