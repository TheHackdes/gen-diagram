import { cmpId } from '../../utils/misc';
import { getDefinition } from '../../data/catalog';
import type { Bond, BondModeId, InfraEdge, InfraNode, IssueSeverity } from '../../types';
import { str, uid } from '../../utils/misc';
import { parseSpeed } from './parallel';
import { isBondable } from './suggest';

export interface BondModeInfo {
  id: BondModeId;
  label: string;
  short: string;
  /** Real link aggregation (bond / LAG) vs a simple redundancy group. */
  kind: 'aggregate' | 'redundancy';
  /** Throughput of all members adds up. */
  aggregatesBandwidth: boolean;
  /** The partner must run a matching LAG (port-channel) — one device or one MLAG/stack group. */
  partnerAssisted: boolean;
  help: string;
}

export const BOND_MODES: BondModeInfo[] = [
  { id: 'lacp', label: 'LACP (802.3ad)', short: 'LACP', kind: 'aggregate', aggregatesBandwidth: true, partnerAssisted: true, help: 'Dynamic aggregation. Each side must be one device or one stack/MLAG/vPC group.' },
  { id: 'static', label: 'Static LAG (mode on)', short: 'Static', kind: 'aggregate', aggregatesBandwidth: true, partnerAssisted: true, help: 'Static port-channel, no negotiation. Same partner rules as LACP.' },
  { id: 'balance-rr', label: 'Balance-rr', short: 'RR', kind: 'aggregate', aggregatesBandwidth: true, partnerAssisted: true, help: 'Round-robin; the switch side needs a static port-channel.' },
  { id: 'balance-alb', label: 'Balance-alb (adaptive)', short: 'ALB', kind: 'aggregate', aggregatesBandwidth: true, partnerAssisted: false, help: 'Switch-independent: can go to separate switches. The bond lives on one host.' },
  { id: 'balance-tlb', label: 'Balance-tlb (transmit)', short: 'TLB', kind: 'aggregate', aggregatesBandwidth: true, partnerAssisted: false, help: 'Switch-independent, transmit load balancing. The bond lives on one host.' },
  { id: 'active-backup', label: 'Active-backup', short: 'Active-backup', kind: 'aggregate', aggregatesBandwidth: false, partnerAssisted: false, help: 'One active link, the others on standby. Works across independent switches.' },
  { id: 'multipath', label: 'Multipath (MPIO / ECMP)', short: 'Multipath', kind: 'redundancy', aggregatesBandwidth: true, partnerAssisted: false, help: 'Independent paths used together (iSCSI MPIO, ECMP routing). Any devices.' },
  { id: 'redundancy', label: 'Redundant path (backup)', short: 'Redundant', kind: 'redundancy', aggregatesBandwidth: false, partnerAssisted: false, help: 'Backup path (STP, dual WAN, VRRP…). Any devices and link types.' },
];

export const BOND_MODE_BY_ID = Object.fromEntries(BOND_MODES.map((m) => [m.id, m])) as Record<BondModeId, BondModeInfo>;

export function modeInfo(mode: unknown): BondModeInfo {
  return BOND_MODE_BY_ID[mode as BondModeId] ?? BOND_MODE_BY_ID.lacp;
}

export const bondMembers = (bondId: string, edges: InfraEdge[]): InfraEdge[] =>
  edges.filter((e) => e.data?.bondId === bondId).sort((a, b) => cmpId(a.id, b.id));

export function bondTitle(bond: Bond): string {
  return bond.peerName && bond.peerName !== bond.name ? `${bond.name} / ${bond.peerName}` : bond.name;
}

/** Redundancy group of a device: stack, MLAG / vPC pair, HA cluster. */
export const redundancyGroup = (n: InfraNode | undefined): string => (n ? str(n.data.props.redundancyGroup).trim() : '');

export interface BondProblem {
  severity: IssueSeverity;
  message: string;
}

export interface BondAnalysis {
  members: InfraEdge[];
  /** Devices on each side of the aggregate. */
  sides: [string[], string[]];
  problems: BondProblem[];
  /** "2×10 Gbps = 20 Gbps" style capacity. */
  capacity: string;
}

/**
 * Work out the two sides of a bond from its member links and check it against
 * the real-world rules of its mode.
 *
 * Sides: devices of the same redundancy group are one logical device, so they
 * sit on the same side; the two ends of a member are on opposite sides.
 * Unconstrained cases follow the drawing direction (sources on side A).
 */
export function analyzeBond(bond: Bond, edges: InfraEdge[], nodes: InfraNode[]): BondAnalysis {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const members = bondMembers(bond.id, edges).filter((e) => byId.has(e.source) && byId.has(e.target));
  const info = modeInfo(bond.mode);
  const problems: BondProblem[] = [];
  const name = bondTitle(bond);

  // Super-nodes: a redundancy group acts as one device.
  const key = (id: string) => {
    const g = redundancyGroup(byId.get(id));
    return g ? `group:${g}` : id;
  };
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a)!.add(b);
  };
  for (const e of members) {
    const a = key(e.source);
    const b = key(e.target);
    if (a === b) {
      problems.push({
        severity: 'error',
        message: `${name}: a member links two devices of the same redundancy group (${byId.get(e.source)?.data.name} ↔ ${byId.get(e.target)?.data.name})`,
      });
      continue;
    }
    link(a, b);
    link(b, a);
  }
  const color = new Map<string, 0 | 1>();
  let conflict = false;
  for (const e of members) {
    const start = key(e.source);
    if (color.has(start) || !adj.has(start)) continue;
    color.set(start, 0);
    const queue = [start];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const next of adj.get(cur) ?? []) {
        const c = (1 - color.get(cur)!) as 0 | 1;
        if (!color.has(next)) {
          color.set(next, c);
          queue.push(next);
        } else if (color.get(next) !== c) conflict = true;
      }
    }
  }
  if (conflict) problems.push({ severity: 'error', message: `${name}: its links do not form two sides — a device ends up on both sides of the bond` });

  const sides: [string[], string[]] = [[], []];
  const seen = new Set<string>();
  for (const e of members) {
    for (const id of [e.source, e.target]) {
      if (seen.has(id)) continue;
      seen.add(id);
      const c = color.get(key(id));
      if (c !== undefined) sides[c].push(id);
    }
  }

  const nameOf = (id: string) => byId.get(id)?.data.name ?? '?';
  const physical = members.every(isBondable);
  if (info.kind === 'aggregate') {
    if (!physical) problems.push({ severity: 'error', message: `${name}: ${info.short} only bonds cables (Ethernet, fiber, trunk links)` });
    if (info.partnerAssisted) {
      for (const side of sides) {
        if (side.length < 2) continue;
        const groups = new Set(side.map((id) => redundancyGroup(byId.get(id))));
        if (groups.size > 1 || groups.has(''))
          problems.push({
            severity: 'error',
            message: `${name}: ${info.short} towards ${side.map(nameOf).join(' + ')} needs them in one stack / MLAG / vPC group (set the same “Redundancy group”)`,
          });
      }
    } else if (sides[0].length > 1 && sides[1].length > 1 && !conflict) {
      problems.push({ severity: 'error', message: `${name}: ${info.short} is configured on a single host — one side must be one device` });
    }
    const speeds = new Set(members.map((e) => e.data?.speed ?? ''));
    if (members.length > 1 && speeds.size > 1)
      problems.push({ severity: info.aggregatesBandwidth ? 'warning' : 'info', message: `${name}: members have different speeds (${[...speeds].map((x) => x || '?').join(', ')})` });
    const vlanSets = new Set(members.map((e) => `${e.data?.mode ?? ''}|${e.data?.vlan ?? ''}`));
    if (members.length > 1 && vlanSets.size > 1) problems.push({ severity: 'warning', message: `${name}: members have different VLAN / switchport settings` });
  }
  if (members.length === 1) problems.push({ severity: 'info', message: `${name}: a single member link — no redundancy yet` });

  return { members, sides, problems, capacity: bondCapacity(info, members) };
}

export function bondCapacity(info: BondModeInfo, members: InfraEdge[]): string {
  const speeds = members.map((e) => e.data?.speed ?? '').filter(Boolean);
  if (!speeds.length) return members.length > 1 ? `${members.length} links` : '';
  const same = speeds.length === members.length && new Set(speeds).size === 1;
  if (members.length === 1) return speeds[0];
  const each = same ? `${members.length}×${speeds[0]}` : speeds.join(' + ');
  if (!info.aggregatesBandwidth || members.length < 2) return each;
  const total = members.reduce((acc, e) => acc + (parseSpeed(e.data?.speed) ?? 0), 0);
  return total ? `${each} = ${total >= 1000 ? `${+(total / 1000).toFixed(1)} Gbps` : `${total} Mbps`}` : each;
}

/** One-line summary: "bond0 / Po1 · LACP · 2×10 Gbps = 20 Gbps". */
export function bondSummary(bond: Bond, members: InfraEdge[]): string {
  const info = modeInfo(bond.mode);
  return [bondTitle(bond), info.short, bondCapacity(info, members)].filter(Boolean).join(' · ');
}

/** Suggested names: bondN on the host side, PoN (port-channel) on network gear. */
export function suggestBondNames(members: InfraEdge[], nodes: InfraNode[], bonds: Bond[]): { name: string; peerName?: string } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const network = (id: string) => ['switch', 'core-switch', 'router', 'firewall'].includes(getDefinition(byId.get(id)?.data.type ?? 'device').role);
  const first = members[0];
  const taken = new Set(bonds.flatMap((b) => [b.name, b.peerName ?? '']));
  const next = (prefix: string, start: number) => {
    for (let i = start; i < 999; i++) if (!taken.has(`${prefix}${i}`)) return `${prefix}${i}`;
    return `${prefix}${start}`;
  };
  if (!first) return { name: next('bond', 0) };
  const sNet = network(first.source);
  const tNet = network(first.target);
  if (sNet && tNet) return { name: next('Po', 1) };
  if (!sNet && !tNet) return { name: next('bond', 0) };
  // Host side first so the label reads "bond0 / Po1".
  return { name: next('bond', 0), peerName: next('Po', 1) };
}

/**
 * v1.3 projects stored `bond` (a name) and `bondMode` on each link and grouped
 * links by device pair. Turn each (pair, name) group into a Bond entity.
 */
export function migrateLegacyBonds(edges: InfraEdge[], bonds: Bond[]): { edges: InfraEdge[]; bonds: Bond[] } {
  const legacy = new Map<string, Bond>();
  const LEGACY_MODES: Record<string, BondModeId> = {
    'LACP (802.3ad)': 'lacp',
    'Active-backup': 'active-backup',
    'Balance-alb': 'balance-alb',
    'Balance-rr': 'balance-rr',
    'Static (on)': 'static',
    'Multipath (MPIO)': 'multipath',
    'Redundancy (STP)': 'redundancy',
  };
  const out = edges.map((e) => {
    const d = e.data;
    if (!d || d.bondId || !(d.bond || d.bondMode)) return e;
    const k = `${[e.source, e.target].sort().join('|')}|${d.bond ?? ''}`;
    let b = legacy.get(k);
    if (!b) {
      const [name, peerName] = (d.bond || 'bond0').split('/').map((x) => x.trim());
      b = { id: uid('b_'), name, peerName: peerName || undefined, mode: LEGACY_MODES[d.bondMode ?? ''] ?? 'lacp' };
      legacy.set(k, b);
    }
    const { bond: _b, bondMode: _m, ...rest } = d;
    void _b;
    void _m;
    return { ...e, data: { ...rest, bondId: b.id } };
  });
  return { edges: out, bonds: [...bonds, ...legacy.values()] };
}

/** Bonds that still have at least one member. */
export function pruneBonds(bonds: Bond[], edges: InfraEdge[]): Bond[] {
  const used = new Set(edges.map((e) => e.data?.bondId).filter(Boolean));
  return bonds.filter((b) => used.has(b.id));
}

/* Building bonds ---------------------------------------------------- */

const PROBE = '__probe';

const isPhysicalLink = isBondable;

/** Errors of a bond made of `members` with `mode` (nothing is changed). */
function errorsOf(mode: BondModeId, members: InfraEdge[], nodes: InfraNode[]): number {
  const tagged = members.map((e) => ({ ...e, data: { connType: 'ethernet' as const, ...e.data, bondId: PROBE } }));
  return analyzeBond({ id: PROBE, name: '', mode }, tagged, nodes).problems.filter((p) => p.severity === 'error').length;
}

/**
 * Mode a new bond should start with: the first one valid for its members —
 * LACP when each side is one device or one stack / MLAG group, active-backup
 * from one host to independent switches, otherwise a redundancy group
 * (independent paths, logical links).
 */
export function suggestBondMode(members: InfraEdge[], nodes: InfraNode[]): BondModeId {
  const order: BondModeId[] = members.every(isPhysicalLink) ? ['lacp', 'active-backup', 'redundancy'] : ['redundancy'];
  return order.find((m) => errorsOf(m, members, nodes) === 0) ?? order[order.length - 1];
}

/** Would adding `edge` to `bond` keep it valid (no new error)? */
export function canJoinBond(bond: Bond, edge: InfraEdge, edges: InfraEdge[], nodes: InfraNode[]): boolean {
  if (edge.data?.bondId === bond.id) return false;
  const members = bondMembers(bond.id, edges);
  if (!members.length) return false;
  return errorsOf(bond.mode, [...members, edge], nodes) <= errorsOf(bond.mode, members, nodes);
}

/** The redundancy group of a device and its peers (stack, MLAG / vPC pair, HA cluster). */
function withPeers(ids: string[], nodes: InfraNode[]): string[] {
  const groups = new Set(ids.map((id) => redundancyGroup(nodes.find((n) => n.id === id))).filter(Boolean));
  const peers = nodes.filter((n) => groups.has(redundancyGroup(n))).map((n) => n.id);
  return [...new Set([...ids, ...peers])];
}

export interface BondSuggestion {
  edge: InfraEdge;
  /** Mode the bond would get with this link. */
  mode: BondModeId;
  /** Why it is related: same devices, a common device, or the same stack / MLAG group. */
  reason: 'parallel' | 'shared-device' | 'group';
}

/**
 * Unbonded links that can form a bond with `edge`: between the same devices,
 * from the same device to another one (host → second switch), or between the
 * same stack / MLAG groups (A→B and C→D when A, C and B, D are pairs).
 */
export function bondSuggestions(edge: InfraEdge, edges: InfraEdge[], nodes: InfraNode[]): BondSuggestion[] {
  // Annotation arrows are not network links.
  if (edge.data?.connType === 'arrow') return [];
  const ends = [edge.source, edge.target];
  const related = new Set(withPeers(ends, nodes));
  const out: BondSuggestion[] = [];
  for (const e of edges) {
    if (e.id === edge.id || e.data?.bondId || isPhysicalLink(e) !== isPhysicalLink(edge)) continue;
    if (e.data?.connType === 'arrow') continue;
    const other = [e.source, e.target];
    const shared = other.filter((id) => ends.includes(id)).length;
    const reason: BondSuggestion['reason'] | undefined =
      shared === 2 ? 'parallel' : shared === 1 ? 'shared-device' : other.every((id) => related.has(id)) ? 'group' : undefined;
    if (!reason) continue;
    // A link to a device on both sides at once cannot be bonded.
    const mode = suggestBondMode([edge, e], nodes);
    if (errorsOf(mode, [edge, e], nodes) > 0) continue;
    out.push({ edge: e, mode, reason });
  }
  const rank = { parallel: 0, 'shared-device': 1, group: 2 };
  return out.sort((a, b) => rank[a.reason] - rank[b.reason] || cmpId(a.edge.id, b.edge.id));
}

export interface MemberTarget {
  from: string;
  to: string;
}

/**
 * Where a new member of `bond` can go: between a device of one side and a
 * device of the other side — or their stack / MLAG peers (e.g. the second
 * switch of an MLAG pair) — as long as the bond stays valid.
 */
export function memberTargets(bond: Bond, edges: InfraEdge[], nodes: InfraNode[]): MemberTarget[] {
  const analysis = analyzeBond(bond, edges, nodes);
  const base = analysis.members[0];
  if (!base) return [];
  const [left, right] = analysis.sides.map((side) => withPeers(side, nodes));
  const out: MemberTarget[] = [];
  for (const from of left)
    for (const to of right) {
      if (from === to) continue;
      const probe: InfraEdge = { id: '__new', source: from, target: to, data: { ...base.data!, bondId: undefined } };
      if (canJoinBond(bond, probe, edges, nodes)) out.push({ from, to });
    }
  return out;
}
