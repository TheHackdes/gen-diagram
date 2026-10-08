import { getDefinition } from '../../data/catalog';
import { modeInfo } from '../connections/bonds';
import type { Bond, InfraEdge, InfraNode, NodeRole, ValidationIssue, Vlan } from '../../types';
import { str } from '../../utils/misc';
import { addressEntries } from '../nodes/ips';

type Issue = Omit<ValidationIssue, 'id'>;

/** Devices that switch frames between their ports: they can form loops. */
const SWITCHING_ROLES = new Set<NodeRole>(['switch', 'core-switch', 'bridge']);
/** Devices that carry VLANs between their links (frames go through them). */
const TRANSIT_ROLES = new Set<NodeRole>(['switch', 'core-switch', 'bridge', 'ap', 'hypervisor']);
/** Devices that route a VLAN (its gateway). */
const GATEWAY_ROLES = new Set<NodeRole>(['router', 'firewall', 'core-switch', 'vpn', 'security']);
/** Link types that carry Ethernet frames. */
const L2_LINKS = new Set(['ethernet', 'fiber', 'generic', 'vlan', 'wifi']);

const roleOf = (n: InfraNode) => getDefinition(n.data.type).role;
const isL2Link = (e: InfraEdge) => L2_LINKS.has(e.data?.connType ?? 'ethernet');
const vlanList = (v: string | undefined) => (v ?? '').split(/[\s,]+/).filter(Boolean);

/** STP setting of a switch: on, off, or not documented. */
function stpOf(n: InfraNode): 'on' | 'off' | 'unknown' {
  const v = str(n.data.props.stp).toLowerCase();
  if (!v) return 'unknown';
  return v === 'off' ? 'off' : 'on';
}

/**
 * Switching loops: a cycle of links between switches. Bonds count as one link
 * and the members of a stack / MLAG / vPC pair (same redundancy group) as one
 * switch, so documented redundancy is not reported.
 */
export function switchingLoops(nodes: InfraNode[], edges: InfraEdge[], bonds: Bond[]): Issue[] {
  const switches = nodes.filter((n) => SWITCHING_ROLES.has(roleOf(n)));
  if (switches.length < 2) return [];
  // Vertex of each switch: its redundancy group, or itself.
  const vertex = new Map<string, string>();
  for (const n of switches) {
    const g = str(n.data.props.redundancyGroup).trim();
    vertex.set(n.id, g ? `g:${g}` : n.id);
  }
  // One graph edge per pair of vertices per bond / link (parallel unbonded links are reported elsewhere).
  const bondIds = new Set(bonds.map((b) => b.id));
  const singleHost = new Set(bonds.filter((b) => modeInfo(b.mode).kind === 'aggregate' && !modeInfo(b.mode).partnerAssisted).map((b) => b.id));
  const links = new Map<string, { a: string; b: string; edgeIds: string[] }>();
  for (const e of edges) {
    if (!isL2Link(e)) continue;
    const a = vertex.get(e.source);
    const b = vertex.get(e.target);
    if (!a || !b || a === b) continue;
    const pair = a < b ? `${a}|${b}` : `${b}|${a}`;
    const bond = e.data?.bondId && bondIds.has(e.data.bondId) ? e.data.bondId : '';
    // Bonded links and parallel links between the same two switches form a single path here.
    // A switch-independent bond (active-backup, ALB, TLB) lives on one device and never forwards
    // between its members: towards different switches it is still one uplink, not a loop.
    const key = bond ? (singleHost.has(bond) ? `bond|${bond}` : `${pair}|${bond}`) : pair;
    const existing = links.get(key);
    if (existing) existing.edgeIds.push(e.id);
    else links.set(key, { a: a < b ? a : b, b: a < b ? b : a, edgeIds: [e.id] });
  }
  // Two bonds (or a bond and a plain link) between the same switches are two paths.
  const list = [...links.values()];
  const adj = new Map<string, { to: string; i: number }[]>();
  list.forEach((l, i) => {
    adj.set(l.a, [...(adj.get(l.a) ?? []), { to: l.b, i }]);
    adj.set(l.b, [...(adj.get(l.b) ?? []), { to: l.a, i }]);
  });
  // Links on a cycle are the non-bridges (Tarjan).
  const disc = new Map<string, number>();
  const low = new Map<string, number>();
  const bridge = new Set<number>();
  let time = 0;
  const visit = (u: string, parentLink: number) => {
    disc.set(u, time);
    low.set(u, time++);
    for (const { to, i } of adj.get(u) ?? []) {
      if (i === parentLink) continue;
      if (!disc.has(to)) {
        visit(to, i);
        low.set(u, Math.min(low.get(u)!, low.get(to)!));
        if (low.get(to)! > disc.get(u)!) bridge.add(i);
      } else low.set(u, Math.min(low.get(u)!, disc.get(to)!));
    }
  };
  for (const v of adj.keys()) if (!disc.has(v)) visit(v, -1);
  const cyclic = list.map((l, i) => ({ ...l, i })).filter((l) => !bridge.has(l.i));
  if (!cyclic.length) return [];

  // Group the cyclic links into loops (connected sets).
  const parent = new Map<string, string>();
  const find = (x: string): string => (parent.get(x) === undefined || parent.get(x) === x ? x : find(parent.get(x)!));
  for (const l of cyclic) parent.set(find(l.a), find(l.b));
  const loops = new Map<string, typeof cyclic>();
  for (const l of cyclic) loops.set(find(l.a), [...(loops.get(find(l.a)) ?? []), l]);

  const members = (v: string) => switches.filter((n) => vertex.get(n.id) === v);
  const issues: Issue[] = [];
  for (const loop of loops.values()) {
    const devices = [...new Set(loop.flatMap((l) => [l.a, l.b]))].flatMap(members);
    const names = devices.map((n) => n.data.name).join(', ');
    const edgeIds = loop.flatMap((l) => l.edgeIds);
    const nodeIds = devices.map((n) => n.id);
    const stp = devices.map(stpOf);
    if (stp.includes('off')) {
      const off = devices.filter((n) => stpOf(n) === 'off').map((n) => n.data.name).join(', ');
      issues.push({ severity: 'error', message: `Switching loop between ${names} with STP disabled on ${off} — broadcast storm`, nodeIds, edgeIds });
    } else if (stp.every((s) => s === 'on')) {
      issues.push({ severity: 'info', message: `Redundant loop between ${names}: STP blocks one of its links`, nodeIds, edgeIds });
    } else {
      issues.push({
        severity: 'warning',
        message: `Switching loop between ${names} — enable STP (RSTP/MSTP) on these switches, or bond the links / group the switches (stack, MLAG)`,
        nodeIds,
        edgeIds,
      });
    }
  }
  return issues;
}

/** VLANs of a device: those of its addresses (and of the device itself). */
function vlansOf(n: InfraNode): Set<string> {
  const out = new Set<string>();
  for (const e of addressEntries(n.data.props)) if (e.vlan) out.add(e.vlan);
  const own = str(n.data.props.vlan);
  if (own) out.add(own);
  return out;
}

/** Does this link let VLAN `vlan` through? Links that do not document their VLANs are assumed to. */
function carries(e: InfraEdge, vlan: string): boolean {
  const list = vlanList(e.data?.vlan);
  if (!list.length) return true;
  return list.includes(vlan);
}

/**
 * VLANs that cannot reach their gateway: a device in VLAN 20 behind a trunk
 * (or a hypervisor uplink) that does not carry VLAN 20.
 */
export function vlanReachability(nodes: InfraNode[], edges: InfraEdge[], vlans: Vlan[]): Issue[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const known = new Map(vlans.map((v) => [String(v.id), v]));
  const adj = new Map<string, InfraEdge[]>();
  for (const e of edges) {
    if (!isL2Link(e) || !byId.has(e.source) || !byId.has(e.target)) continue;
    adj.set(e.source, [...(adj.get(e.source) ?? []), e]);
    adj.set(e.target, [...(adj.get(e.target) ?? []), e]);
  }
  if (!adj.size) return [];

  // Gateways of each VLAN: the device holding its gateway address, or a router / firewall / L3 switch with an address in it.
  const gateways = new Map<string, Set<string>>();
  for (const n of nodes) {
    const routes = GATEWAY_ROLES.has(roleOf(n));
    for (const a of addressEntries(n.data.props)) {
      const vlan = a.vlan ?? '';
      const v = known.get(vlan);
      if (!v) continue;
      if ((v.gateway && a.address === v.gateway) || routes) gateways.set(vlan, (gateways.get(vlan) ?? new Set()).add(n.id));
    }
  }

  /** Where the frames of a device leave: the device, or the host it runs on. */
  const attachment = (n: InfraNode): InfraNode | undefined => {
    let cur: InfraNode | undefined = n;
    while (cur && !adj.has(cur.id)) cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    return cur;
  };

  /** Shortest path (as links) from `start` to a gateway, through transit devices only. */
  const route = (start: string, targets: Set<string>, vlan: string | null): InfraEdge[] | null => {
    const prev = new Map<string, InfraEdge | null>([[start, null]]);
    const queue = [start];
    while (queue.length) {
      const u = queue.shift()!;
      if (targets.has(u)) {
        const path: InfraEdge[] = [];
        let cur = u;
        while (prev.get(cur)) {
          const e = prev.get(cur)!;
          path.unshift(e);
          cur = e.source === cur ? e.target : e.source;
        }
        return path;
      }
      // Frames only cross switches, bridges, access points and hypervisors.
      if (u !== start && !TRANSIT_ROLES.has(roleOf(byId.get(u)!))) continue;
      for (const e of adj.get(u) ?? []) {
        if (vlan && !carries(e, vlan)) continue;
        const v = e.source === u ? e.target : e.source;
        if (prev.has(v)) continue;
        prev.set(v, e);
        queue.push(v);
      }
    }
    return null;
  };

  // One issue per blocking link and VLAN, listing the devices it cuts off.
  const blocked = new Map<string, { edge: InfraEdge; vlan: string; devices: InfraNode[] }>();
  for (const n of nodes) {
    for (const vlan of vlansOf(n)) {
      const targets = gateways.get(vlan);
      if (!targets?.size || targets.has(n.id)) continue;
      const from = attachment(n);
      if (!from || targets.has(from.id)) continue;
      if (route(from.id, targets, vlan)) continue;
      const any = route(from.id, targets, null);
      const cut = any?.find((e) => !carries(e, vlan));
      if (!cut) continue;
      const key = `${cut.id}|${vlan}`;
      const entry = blocked.get(key) ?? { edge: cut, vlan, devices: [] };
      entry.devices.push(n);
      blocked.set(key, entry);
    }
  }
  const issues: Issue[] = [];
  for (const { edge, vlan, devices } of blocked.values()) {
    const s = byId.get(edge.source)!;
    const t = byId.get(edge.target)!;
    const list = vlanList(edge.data?.vlan).join(', ');
    const who = devices.length > 3 ? `${devices.slice(0, 3).map((d) => d.data.name).join(', ')} and ${devices.length - 3} more` : devices.map((d) => d.data.name).join(', ');
    const what = edge.data?.mode === 'access' ? `access link (VLAN ${list})` : `trunk (VLANs ${list})`;
    issues.push({
      severity: 'warning',
      message: `VLAN ${vlan} does not reach its gateway: ${s.data.name} ↔ ${t.data.name} ${what} does not carry it (used by ${who})`,
      nodeIds: devices.map((d) => d.id),
      edgeIds: [edge.id],
    });
  }
  return issues;
}
