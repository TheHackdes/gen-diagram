import { definitionHasField, getDefinition } from '../../data/catalog';
import type { InfraEdge, InfraNode, ValidationIssue, Vlan } from '../../types';
import { cidrEquals, ipInCidr, isValidCidr, isValidIPv4, isValidMac, parseCidr } from '../../utils/ip';
import { str } from '../../utils/misc';

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

export function validateDiagram(nodes: InfraNode[], edges: InfraEdge[], vlans: Vlan[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const push = (issue: Omit<ValidationIssue, 'id'>) => issues.push({ id: `i${issues.length}`, ...issue });
  const vlanById = new Map(vlans.map((v) => [String(v.id), v]));

  // --- Formats --------------------------------------------------------
  for (const n of nodes) {
    const def = getDefinition(n.data.type);
    for (const f of def.fields) {
      const value = n.data.props[f.key];
      if (value === undefined || value === '') continue;
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
    for (const key of ['ip', 'publicIp', 'vip']) {
      const ip = str(n.data.props[key]).trim();
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

  // --- IP vs subnet ----------------------------------------------------
  for (const n of nodes) {
    const ip = str(n.data.props.ip);
    if (!isValidIPv4(ip)) continue;
    const vlan = vlanById.get(str(n.data.props.vlan));
    if (vlan?.subnet && ipInCidr(ip, vlan.subnet) === false)
      push({ severity: 'warning', message: `${n.data.name}: ${ip} is outside VLAN ${vlan.id} subnet ${vlan.subnet}`, nodeIds: [n.id] });
    const net = str(n.data.props.network);
    if (net && ipInCidr(ip, net) === false)
      push({ severity: 'warning', message: `${n.data.name}: ${ip} is outside its network ${net}`, nodeIds: [n.id] });
    const zone = enclosingZone(n, byId);
    if (zone) {
      const subnet = zoneSubnet(zone, vlans);
      if (subnet && ipInCidr(ip, subnet) === false && !(vlan?.subnet && ipInCidr(ip, vlan.subnet)))
        push({ severity: 'warning', message: `${n.data.name}: ${ip} is outside ${zone.data.name} (${subnet})`, nodeIds: [n.id, zone.id] });
    }
    const gw = str(n.data.props.gateway);
    const subnetForGw = net || vlan?.subnet;
    if (gw && subnetForGw && ipInCidr(gw, subnetForGw) === false)
      push({ severity: 'warning', message: `${n.data.name}: gateway ${gw} is not in ${subnetForGw}`, nodeIds: [n.id] });
  }

  // --- Servers without gateway (when the VLAN does not define one) -----
  for (const n of nodes) {
    const def = getDefinition(n.data.type);
    if (def.role !== 'server' || !definitionHasField(def, 'gateway')) continue;
    if (!str(n.data.props.ip) || str(n.data.props.gateway)) continue;
    const vlan = vlanById.get(str(n.data.props.vlan));
    if (!vlan?.gateway) push({ severity: 'info', message: `${n.data.name} has no gateway`, nodeIds: [n.id] });
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
    for (let j = i + 1; j < subnetOwners.length; j++)
      if (cidrEquals(subnetOwners[i].subnet, subnetOwners[j].subnet))
        push({
          severity: 'warning',
          message: `VLAN ${subnetOwners[i].id} and VLAN ${subnetOwners[j].id} share subnet ${subnetOwners[i].subnet}`,
        });
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
    if (sp) portUse.set(`${s.id}|${sp}`, [...(portUse.get(`${s.id}|${sp}`) ?? []), e.id]);
    if (tp) portUse.set(`${t.id}|${tp}`, [...(portUse.get(`${t.id}|${tp}`) ?? []), e.id]);
    const sd = getDefinition(s.data.type);
    const td = getDefinition(t.data.type);
    const type = e.data?.connType ?? 'ethernet';
    const physical = type === 'ethernet' || type === 'fiber';
    if (physical && (sd.role === 'cloud' || td.role === 'cloud'))
      push({ severity: 'info', message: `${s.data.name} ↔ ${t.data.name}: a cloud is usually reached through a WAN/VPN link`, edgeIds: [e.id] });
    if (type === 'wifi' && sd.role !== 'ap' && td.role !== 'ap')
      push({ severity: 'warning', message: `${s.data.name} ↔ ${t.data.name}: Wi-Fi link without an access point`, edgeIds: [e.id] });
    if (physical && (ancestors(s, byId).some((a) => a.id === t.id) || ancestors(t, byId).some((a) => a.id === s.id)))
      push({ severity: 'info', message: `${s.data.name} ↔ ${t.data.name}: physical link between a host and its own guest`, edgeIds: [e.id] });
    const vlan = e.data?.vlan;
    if (vlan && e.data?.mode !== 'trunk') {
      for (const id of vlan.split(/[\s,]+/).filter(Boolean)) {
        if (!vlanById.has(id)) push({ severity: 'warning', message: `Link ${s.data.name} ↔ ${t.data.name} uses undefined VLAN ${id}`, edgeIds: [e.id] });
      }
    }
    if (e.data?.mode === 'access' && vlan && vlan.split(/[\s,]+/).filter(Boolean).length > 1)
      push({ severity: 'warning', message: `Access port ${s.data.name} ↔ ${t.data.name} carries several VLANs (use trunk)`, edgeIds: [e.id] });
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
