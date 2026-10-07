import { definitionHasField, getDefinition } from '../../data/catalog';
import type { Bond, InfraEdge, InfraNode, NodeRole, ValidationIssue, Vlan } from '../../types';
import { analyzeBond } from '../connections/bonds';
import { cidrEquals, cidrOverlaps, ipInCidr, isValidCidr, isValidIPv4, isValidMac, parseCidr, parseIPv4 } from '../../utils/ip';
import { str } from '../../utils/misc';
import { addressEntries, allIps, hasHostFirewall, hasVpn, hasWifi } from '../nodes/ips';
import { servicesOf } from '../../data/services';
import { referenceProblem } from '../firewall/addresses';
import { switchingLoops, vlanReachability } from './l2';
import { addressProblem, hasRules, isValidPorts, rulesOf } from '../firewall/rules';

/** Devices that forward Ethernet frames between their ports (can loop). */
const L2_ROLES = new Set<NodeRole>(['switch', 'core-switch', 'ap', 'bridge', 'hypervisor']);

/** Devices whose firewall sees forwarded traffic (routing, bridging guests or containers). */
const FORWARDING_ROLES = new Set<NodeRole>(['router', 'firewall', 'core-switch', 'vpn', 'hypervisor', 'docker-host', 'load-balancer', 'security']);

const ZONE_TYPES = new Set(['vlan-zone', 'subnet', 'network-zone', 'dmz', 'docker-network']);

function ancestors(node: InfraNode, byId: Map<string, InfraNode>): InfraNode[] {
  const out: InfraNode[] = [];
  let p = node.parentId ? byId.get(node.parentId) : undefined;
  while (p && out.length < 50) {
    out.push(p);
    p = p.parentId ? byId.get(p.parentId) : undefined;
  }
  return out;
}

/**
 * Nearest network zone around a node. A Docker host isolates its containers:
 * they live on Docker networks, not on the VLAN around the host.
 */
function enclosingZone(node: InfraNode, byId: Map<string, InfraNode>): InfraNode | undefined {
  for (const a of ancestors(node, byId)) {
    if (ZONE_TYPES.has(a.data.type)) return a;
    if (a.data.type === 'docker-host') return undefined;
  }
  return undefined;
}

/** Subnet declared by a zone: its own field or its bound VLAN. */
export function zoneSubnet(zone: InfraNode, vlans: Vlan[]): string {
  const own = str(zone.data.props.subnet);
  if (own) return own;
  const v = vlans.find((x) => String(x.id) === str(zone.data.props.vlan));
  return v?.subnet ?? '';
}

export function validateDiagram(nodes: InfraNode[], edges: InfraEdge[], vlans: Vlan[], bonds: Bond[] = []): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const push = (issue: Omit<ValidationIssue, 'id'>) => issues.push({ id: `i${issues.length}`, ...issue });
  const vlanById = new Map(vlans.map((v) => [String(v.id), v]));

  // --- Formats --------------------------------------------------------
  for (const n of nodes) {
    const def = getDefinition(n.data.type);
    const hasAddresses = definitionHasField(def, 'ip');
    for (const f of def.fields) {
      const value = n.data.props[f.key];
      if (value === undefined || value === '') continue;
      // Addresses and their VLANs are checked together in the address section.
      if (hasAddresses && (f.key === 'ip' || f.key === 'vlan')) continue;
      if (f.type === 'ip' && !isValidIPv4(value))
        push({ severity: 'error', message: `${n.data.name}: "${str(value)}" is not a valid IPv4 address (${f.label})`, nodeIds: [n.id] });
      if (f.type === 'cidr' && !isValidCidr(value))
        push({ severity: 'error', message: `${n.data.name}: "${str(value)}" is not a valid CIDR (${f.label})`, nodeIds: [n.id] });
      if (f.type === 'mac' && !isValidMac(value))
        push({ severity: 'warning', message: `${n.data.name}: "${str(value)}" is not a valid MAC address`, nodeIds: [n.id] });
      if (f.type === 'vlan' && !vlanById.has(str(value)))
        push({ severity: 'warning', message: `${n.data.name} references VLAN ${str(value)} which is not defined`, nodeIds: [n.id] });
    }
  }

  // --- Duplicate IPs --------------------------------------------------
  const ipOwners = new Map<string, InfraNode[]>();
  for (const n of nodes) {
    const addresses = [...['publicIp', 'vip'].map((k) => str(n.data.props[k]).trim()), ...allIps(n.data.props).map((e) => e.address.trim())];
    for (const ip of new Set(addresses)) {
      if (!isValidIPv4(ip)) continue;
      ipOwners.set(ip, [...(ipOwners.get(ip) ?? []), n]);
    }
  }
  for (const [ip, owners] of ipOwners) {
    const unique = [...new Set(owners)];
    if (unique.length > 1)
      push({
        severity: 'error',
        message: `${ip} is duplicated (${unique.map((o) => o.data.name).join(', ')})`,
        nodeIds: unique.map((o) => o.id),
      });
  }

  // --- Addresses: every address of a node is checked the same way ------
  for (const n of nodes) {
    const entries = addressEntries(n.data.props).filter((e) => e.address);
    const valid: { address: string; subnet?: string }[] = [];
    for (const e of entries) {
      if (!isValidIPv4(e.address)) {
        push({ severity: 'error', message: `${n.data.name}: "${e.address}" is not a valid IPv4 address`, nodeIds: [n.id] });
        continue;
      }
      const vlan = e.vlan ? vlanById.get(e.vlan) : undefined;
      if (e.vlan && !vlan) push({ severity: 'warning', message: `${n.data.name}: ${e.address} references VLAN ${e.vlan} which is not defined`, nodeIds: [n.id] });
      if (vlan?.subnet && ipInCidr(e.address, vlan.subnet) === false)
        push({ severity: 'warning', message: `${n.data.name}: ${e.address} is outside VLAN ${vlan.id} subnet ${vlan.subnet}`, nodeIds: [n.id] });
      const c = parseCidr(vlan?.subnet);
      const a = parseIPv4(e.address);
      if (c && a !== null && c.prefix < 31 && ipInCidr(e.address, vlan!.subnet) === true) {
        if (a === c.network) push({ severity: 'error', message: `${n.data.name}: ${e.address} is the network address of ${vlan!.subnet}`, nodeIds: [n.id] });
        if (a === (c.network | (~c.mask >>> 0)) >>> 0) push({ severity: 'error', message: `${n.data.name}: ${e.address} is the broadcast address of ${vlan!.subnet}`, nodeIds: [n.id] });
      }
      valid.push({ address: e.address, subnet: vlan?.subnet });
    }
    if (!valid.length) continue;
    // A multi-homed device only needs one address in a given network.
    const anyIn = (subnet: string) => valid.some((v) => ipInCidr(v.address, subnet) === true);
    const list = valid.map((v) => v.address).join(', ');
    const net = str(n.data.props.network);
    if (isValidCidr(net) && !anyIn(net)) push({ severity: 'warning', message: `${n.data.name}: no address (${list}) in its network ${net}`, nodeIds: [n.id] });
    const zone = enclosingZone(n, byId);
    const zoneNet = zone ? zoneSubnet(zone, vlans) : '';
    // Equipment can sit in a zone with an address of its own VLAN (e.g. an AP managed in VLAN 99).
    const explained = valid.some((v) => v.subnet && ipInCidr(v.address, v.subnet) === true);
    if (zone && isValidCidr(zoneNet) && !anyIn(zoneNet) && !explained)
      push({ severity: 'warning', message: `${n.data.name}: no address (${list}) in ${zone.data.name} (${zoneNet})`, nodeIds: [n.id, zone.id] });
    const gw = str(n.data.props.gateway);
    const reachable = [net, ...valid.map((v) => v.subnet ?? '')].filter(isValidCidr);
    if (isValidIPv4(gw) && reachable.length && !reachable.some((sn) => ipInCidr(gw, sn) === true))
      push({ severity: 'warning', message: `${n.data.name}: gateway ${gw} is not on any of its networks (${reachable.join(', ')})`, nodeIds: [n.id] });
  }

  // --- Servers without gateway (when the VLAN does not define one) -----
  for (const n of nodes) {
    const def = getDefinition(n.data.type);
    if (def.role !== 'server' || !definitionHasField(def, 'gateway')) continue;
    if (!str(n.data.props.ip) || str(n.data.props.gateway)) continue;
    // Any of its VLANs may provide the gateway.
    const viaVlan = addressEntries(n.data.props).some((e) => vlanById.get(e.vlan ?? '')?.gateway);
    if (!viaVlan) push({ severity: 'info', message: `${n.data.name} has no gateway`, nodeIds: [n.id] });
  }

  // --- VLAN definitions ------------------------------------------------
  const vlanIds = new Map<number, Vlan[]>();
  for (const v of vlans) vlanIds.set(v.id, [...(vlanIds.get(v.id) ?? []), v]);
  for (const [id, list] of vlanIds) {
    if (list.length > 1) push({ severity: 'error', message: `VLAN ${id} is defined ${list.length} times` });
    if (id < 1 || id > 4094) push({ severity: 'error', message: `VLAN ${id} is out of range (1–4094)` });
  }
  for (const v of vlans) {
    if (v.subnet && !isValidCidr(v.subnet)) push({ severity: 'error', message: `VLAN ${v.id}: invalid subnet "${v.subnet}"` });
    if (v.gateway && v.subnet && ipInCidr(v.gateway, v.subnet) === false)
      push({ severity: 'warning', message: `VLAN ${v.id}: gateway ${v.gateway} is outside ${v.subnet}` });
  }
  const subnetOwners = vlans.filter((v) => parseCidr(v.subnet));
  for (let i = 0; i < subnetOwners.length; i++)
    for (let j = i + 1; j < subnetOwners.length; j++) {
      const [x, y] = [subnetOwners[i], subnetOwners[j]];
      if (cidrEquals(x.subnet, y.subnet)) push({ severity: 'warning', message: `VLAN ${x.id} and VLAN ${y.id} share subnet ${x.subnet}` });
      else if (cidrOverlaps(x.subnet, y.subnet)) push({ severity: 'warning', message: `VLAN ${x.id} (${x.subnet}) and VLAN ${y.id} (${y.subnet}) have overlapping subnets` });
    }
  for (const z of nodes) {
    if (!ZONE_TYPES.has(z.data.type)) continue;
    const vlan = vlanById.get(str(z.data.props.vlan));
    const own = str(z.data.props.subnet);
    if (vlan?.subnet && own && !cidrEquals(vlan.subnet, own))
      push({
        severity: 'warning',
        message: `VLAN ${vlan.id} has conflicting subnet definitions (${vlan.subnet} vs ${own} in ${z.data.name})`,
        nodeIds: [z.id],
      });
  }

  // --- Connections -----------------------------------------------------
  const portUse = new Map<string, string[]>();
  for (const e of edges) {
    const s = byId.get(e.source);
    const t = byId.get(e.target);
    if (!s || !t) {
      push({ severity: 'error', message: 'A connection references a missing element', edgeIds: [e.id] });
      continue;
    }
    const sp = e.data?.sourcePort;
    const tp = e.data?.targetPort;
    // Only a physical port can carry a single cable; tunnels and radios serve many peers.
    const physicalLink = ['ethernet', 'fiber', 'wan', 'generic', 'vlan'].includes(e.data?.connType ?? 'ethernet');
    if (sp && physicalLink) portUse.set(`${s.id}|${sp}`, [...(portUse.get(`${s.id}|${sp}`) ?? []), e.id]);
    if (tp && physicalLink) portUse.set(`${t.id}|${tp}`, [...(portUse.get(`${t.id}|${tp}`) ?? []), e.id]);
    const sd = getDefinition(s.data.type);
    const td = getDefinition(t.data.type);
    const type = e.data?.connType ?? 'ethernet';
    const physical = type === 'ethernet' || type === 'fiber';
    if (physical && (sd.role === 'cloud' || td.role === 'cloud'))
      push({ severity: 'info', message: `${s.data.name} ↔ ${t.data.name}: a cloud is usually reached through a WAN/VPN link`, edgeIds: [e.id] });
    if (type === 'wifi' && !hasWifi(s) && !hasWifi(t))
      push({ severity: 'warning', message: `${s.data.name} ↔ ${t.data.name}: Wi-Fi link without an access point (enable “Integrated Wi-Fi AP” on a router)`, edgeIds: [e.id] });
    if (physical && (ancestors(s, byId).some((a) => a.id === t.id) || ancestors(t, byId).some((a) => a.id === s.id)))
      push({ severity: 'info', message: `${s.data.name} ↔ ${t.data.name}: physical link between a host and its own guest`, edgeIds: [e.id] });
    if (type === 'vpn') {
      // Clients (laptops, phones) and clouds bring their own VPN endpoint.
      const capable = (n: InfraNode) => hasVpn(n) || ['endpoint', 'cloud', 'wan'].includes(getDefinition(n.data.type).role);
      for (const n of [s, t].filter((x) => !capable(x)))
        push({
          severity: 'warning',
          message: `VPN tunnel ${s.data.name} ↔ ${t.data.name}: ${n.data.name} has no VPN gateway${getDefinition(n.data.type).capabilities?.includes('vpn') ? ' (enable “Integrated VPN”)' : ''}`,
          nodeIds: [n.id],
          edgeIds: [e.id],
        });
    }
    const vlan = e.data?.vlan;
    // Access and trunk links alike must only carry defined VLANs.
    if (vlan) {
      for (const id of vlan.split(/[\s,]+/).filter(Boolean)) {
        if (!vlanById.has(id)) push({ severity: 'warning', message: `Link ${s.data.name} ↔ ${t.data.name} uses undefined VLAN ${id}`, edgeIds: [e.id] });
      }
    }
    if (e.data?.mode === 'access' && vlan && vlan.split(/[\s,]+/).filter(Boolean).length > 1)
      push({ severity: 'warning', message: `Access port ${s.data.name} ↔ ${t.data.name} carries several VLANs (use trunk)`, edgeIds: [e.id] });
  }
  // --- Bonds / aggregates ----------------------------------------------
  for (const bond of bonds) {
    const analysis = analyzeBond(bond, edges, nodes);
    if (!analysis.members.length) continue;
    const memberIds = analysis.members.map((e) => e.id);
    for (const p of analysis.problems) push({ severity: p.severity, message: p.message, edgeIds: memberIds });
  }
  // Parallel links that are not grouped: a loop only between two L2-forwarding devices.
  const pairs = new Map<string, InfraEdge[]>();
  for (const e of edges) {
    if (!['ethernet', 'fiber'].includes(e.data?.connType ?? 'ethernet') || e.data?.bondId) continue;
    const k = [e.source, e.target].sort().join('|');
    pairs.set(k, [...(pairs.get(k) ?? []), e]);
  }
  for (const group of pairs.values()) {
    if (group.length < 2) continue;
    const s = byId.get(group[0].source);
    const t = byId.get(group[0].target);
    if (!s || !t) continue;
    const label = `${s.data.name} ↔ ${t.data.name}`;
    const bridging = [s, t].every((n) => L2_ROLES.has(getDefinition(n.data.type).role));
    push(
      bridging
        ? { severity: 'warning', message: `${label}: ${group.length} parallel links without bond — a switching loop unless STP blocks them (create a bond)`, edgeIds: group.map((e) => e.id) }
        : { severity: 'info', message: `${label}: ${group.length} parallel links are not grouped — create a bond or a multipath group to document the redundancy`, edgeIds: group.map((e) => e.id) },
    );
  }

  // --- Layer 2: switching loops, VLANs cut off from their gateway -------
  for (const issue of switchingLoops(nodes, edges, bonds)) push(issue);
  for (const issue of vlanReachability(nodes, edges, vlans)) push(issue);

  // --- Redundancy groups (stack / MLAG / HA) ----------------------------
  const groups = new Map<string, InfraNode[]>();
  for (const n of nodes) {
    const g = str(n.data.props.redundancyGroup).trim();
    if (g) groups.set(g, [...(groups.get(g) ?? []), n]);
  }
  for (const [g, members] of groups) {
    if (members.length === 1) push({ severity: 'info', message: `Redundancy group “${g}” has a single device (${members[0].data.name})`, nodeIds: [members[0].id] });
    const roles = new Set(members.map((m) => getDefinition(m.data.type).role));
    if (roles.size > 1) push({ severity: 'warning', message: `Redundancy group “${g}” mixes different kinds of equipment (${members.map((m) => m.data.name).join(', ')})`, nodeIds: members.map((m) => m.id) });
  }

  for (const [key, ids] of portUse) {
    if (ids.length < 2) continue;
    const [nodeId, port] = key.split('|');
    push({
      severity: 'error',
      message: `Port ${port} of ${byId.get(nodeId)?.data.name ?? '?'} is used by ${ids.length} links`,
      nodeIds: [nodeId],
      edgeIds: ids,
    });
  }

  // --- Integrated services ---------------------------------------------
  for (const n of nodes) {
    const def = getDefinition(n.data.type);
    if (!def.capabilities?.includes('firewall') || hasHostFirewall(n)) continue;
    if (ancestors(n, byId).some((a) => a.data.type === 'dmz'))
      push({ severity: 'info', message: `${n.data.name} is exposed in the DMZ without a host firewall`, nodeIds: [n.id] });
  }
  for (const n of nodes) {
    if (n.data.props.vpn !== true) continue;
    const tunnel = str(n.data.props.vpnNetwork);
    if (!tunnel) continue;
    const clash = vlans.find((v) => v.subnet && cidrOverlaps(v.subnet, tunnel));
    if (clash) push({ severity: 'warning', message: `${n.data.name}: VPN tunnel network ${tunnel} overlaps VLAN ${clash.id}`, nodeIds: [n.id] });
  }

  // --- VPN tunnel addresses --------------------------------------------
  for (const n of nodes) {
    if (n.data.props.vpn !== true) continue;
    const ip = str(n.data.props.vpnIp);
    const net = str(n.data.props.vpnNetwork);
    if (ip && isValidIPv4(ip) && net && ipInCidr(ip, net) === false)
      push({ severity: 'warning', message: `${n.data.name}: tunnel IP ${ip} is outside tunnel network ${net}`, nodeIds: [n.id] });
  }
  const tunnelOwners = new Map<string, InfraNode[]>();
  for (const n of nodes) {
    const ip = n.data.props.vpn === true ? str(n.data.props.vpnIp) : '';
    if (isValidIPv4(ip)) tunnelOwners.set(ip, [...(tunnelOwners.get(ip) ?? []), n]);
  }
  for (const [ip, owners] of tunnelOwners)
    if (owners.length > 1)
      push({ severity: 'error', message: `Tunnel IP ${ip} is used by ${owners.map((o) => o.data.name).join(', ')}`, nodeIds: owners.map((o) => o.id) });

  // --- Several DHCP servers on one VLAN --------------------------------
  const dhcpByVlan = new Map<string, InfraNode[]>();
  for (const n of nodes) {
    const isDhcp = n.data.type === 'dhcp-server' || servicesOf(n.data.props).includes('dhcp');
    if (!isDhcp) continue;
    // A DHCP server answers on every VLAN where it has an address.
    const served = new Set(addressEntries(n.data.props).map((e) => e.vlan ?? '').filter(Boolean));
    if (!served.size && str(n.data.props.vlan)) served.add(str(n.data.props.vlan));
    for (const vlan of served) dhcpByVlan.set(vlan, [...(dhcpByVlan.get(vlan) ?? []), n]);
  }
  for (const [vlan, servers] of dhcpByVlan)
    if (servers.length > 1)
      push({
        severity: 'warning',
        message: `VLAN ${vlan} has ${servers.length} DHCP servers (${servers.map((x) => x.data.name).join(', ')}) — make sure scopes do not overlap`,
        nodeIds: servers.map((x) => x.id),
      });

  // --- Firewall rules ----------------------------------------------------
  for (const n of nodes) {
    if (!hasRules(n)) continue;
    rulesOf(n.data.props).forEach((r, i) => {
      if (!r.enabled) return;
      const where = `${n.data.name} rule #${i + 1}`;
      const src = addressProblem(r.source) ?? referenceProblem(r.source, nodes, vlans);
      const dst = addressProblem(r.destination) ?? referenceProblem(r.destination, nodes, vlans);
      if (src) push({ severity: 'error', message: `${where}: source — ${src}`, nodeIds: [n.id] });
      if (dst) push({ severity: 'error', message: `${where}: destination — ${dst}`, nodeIds: [n.id] });
      if ((r.protocol === 'tcp' || r.protocol === 'udp' || r.protocol === 'tcp/udp') && !isValidPorts(r.ports))
        push({ severity: 'error', message: `${where}: invalid ports "${r.ports}"`, nodeIds: [n.id] });
    });
    const rules = rulesOf(n.data.props).filter((r) => r.enabled);
    // Forwarded traffic only exists on devices that route or bridge it.
    if (rules.some((r) => r.direction === 'forward') && !FORWARDING_ROLES.has(getDefinition(n.data.type).role))
      push({ severity: 'info', message: `${n.data.name}: “Forward” rules only apply to devices that route or bridge traffic`, nodeIds: [n.id] });
    const catchAll = rules.findIndex((r) => r.source.trim() === 'any' && r.destination.trim() === 'any' && r.protocol === 'any' && r.direction !== 'out');
    if (catchAll >= 0 && catchAll < rules.length - 1)
      push({ severity: 'warning', message: `${n.data.name}: rule #${catchAll + 1} matches everything — the rules after it are never used`, nodeIds: [n.id] });
  }

  // --- Annotations referring to deleted equipment ---------------------
  for (const n of nodes) {
    const scope = str(n.data.props.scope);
    if (n.data.type === 'fw-table' && scope && scope !== 'all' && !byId.has(scope))
      push({ severity: 'warning', message: `“${str(n.data.props.text) || 'Firewall rules'}” table refers to deleted equipment`, nodeIds: [n.id] });
  }

  // --- Isolated equipment ----------------------------------------------
  const connected = new Set<string>();
  for (const e of edges) {
    connected.add(e.source);
    connected.add(e.target);
  }
  for (const n of nodes) {
    const def = getDefinition(n.data.type);
    if (def.kind !== 'device' && def.kind !== 'container') continue;
    if (def.standalone || connected.has(n.id)) continue;
    // Guests are implicitly connected through their host.
    if (['vm', 'lxc', 'docker-container', 'docker-host', 'bridge', 'storage'].includes(def.role) && n.parentId) continue;
    push({ severity: 'warning', message: `${n.data.name} has no network connection`, nodeIds: [n.id] });
  }

  const order = { error: 0, warning: 1, info: 2 } as const;
  return issues.sort((a, b) => order[a.severity] - order[b.severity]);
}
