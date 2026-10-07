import { getDefinition } from '../../data/catalog';
import { CATEGORY_BY_ID } from '../../data/categories';
import { formatOs } from '../../data/operatingSystems';
import { SERVICE_BY_ID, servicesOf } from '../../data/services';
import type { Bond, InfraEdge, InfraNode, ValidationIssue, Vlan } from '../../types';
import { ipInCidr, parseCidr, parseIPv4 } from '../../utils/ip';
import { cmpId, str } from '../../utils/misc';
import { bondCapacity, bondMembers, modeInfo } from '../connections/bonds';
import { resolveAddress } from '../firewall/addresses';
import { formatPorts, hasRules, rulesOf } from '../firewall/rules';
import { allIps } from '../nodes/ips';

/**
 * Infrastructure documentation built from the diagram: inventory, addressing
 * plan, VLANs, links, bonds, firewall rules, flows and validation issues.
 * The model is format-neutral; see render.ts for Markdown and HTML.
 */
export type DocSectionId = 'summary' | 'diagram' | 'inventory' | 'addressing' | 'vlans' | 'links' | 'bonds' | 'firewall' | 'flows' | 'issues';

export const DOC_SECTIONS: { id: DocSectionId; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'diagram', label: 'Diagram' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'addressing', label: 'Addressing plan' },
  { id: 'vlans', label: 'VLANs' },
  { id: 'links', label: 'Physical links' },
  { id: 'bonds', label: 'Bonds & aggregates' },
  { id: 'firewall', label: 'Firewall rules' },
  { id: 'flows', label: 'Flows & dependencies' },
  { id: 'issues', label: 'Validation issues' },
];

export interface DocTable {
  title?: string;
  note?: string;
  columns: string[];
  rows: string[][];
}

export interface DocSection {
  id: DocSectionId;
  title: string;
  intro?: string;
  /** Key figures (summary). */
  facts?: { label: string; value: string }[];
  tables: DocTable[];
  /** Placeholder for the diagram image. */
  image?: boolean;
  empty?: string;
}

export interface DocModel {
  title: string;
  description?: string;
  generatedAt: string;
  sections: DocSection[];
}

export interface DocInput {
  name: string;
  description?: string;
  nodes: InfraNode[];
  edges: InfraEdge[];
  vlans: Vlan[];
  bonds: Bond[];
  issues: ValidationIssue[];
}

const ipKey = (ip: string) => parseIPv4(ip) ?? Number.MAX_SAFE_INTEGER;
const isDevice = (n: InfraNode) => getDefinition(n.data.type).kind === 'device' || getDefinition(n.data.type).kind === 'container';
const PHYSICAL = new Set(['ethernet', 'fiber', 'wifi', 'wan', 'vlan', 'generic']);

export function buildDocument(input: DocInput, sections: DocSectionId[], now = new Date()): DocModel {
  const { nodes, edges, vlans, bonds, issues } = input;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const name = (id: string) => byId.get(id)?.data.name ?? '?';
  const devices = nodes.filter(isDevice).sort((a, b) => a.data.name.localeCompare(b.data.name));
  const physical = edges.filter((e) => PHYSICAL.has(e.data?.connType ?? 'ethernet'));
  const flows = edges.filter((e) => ['logical', 'arrow', 'vpn'].includes(e.data?.connType ?? ''));
  const out: DocSection[] = [];

  const build: Record<DocSectionId, () => DocSection> = {
    summary: () => ({
      id: 'summary',
      title: 'Summary',
      facts: [
        { label: 'Devices', value: String(devices.length) },
        { label: 'Physical links', value: String(physical.length) },
        { label: 'VLANs', value: String(vlans.length) },
        { label: 'Bonds', value: String(bonds.length) },
        { label: 'Firewall rules', value: String(nodes.reduce((s, n) => s + (hasRules(n) ? rulesOf(n.data.props).length : 0), 0)) },
        { label: 'Issues', value: `${issues.filter((i) => i.severity === 'error').length} errors, ${issues.filter((i) => i.severity === 'warning').length} warnings` },
      ],
      tables: [],
    }),

    diagram: () => ({ id: 'diagram', title: 'Diagram', tables: [], image: true }),

    inventory: () => {
      // One table per category, in catalog order.
      const groups = new Map<string, InfraNode[]>();
      for (const n of devices) {
        const c = getDefinition(n.data.type).category;
        groups.set(c, [...(groups.get(c) ?? []), n]);
      }
      const tables: DocTable[] = [...groups].map(([cat, list]) => ({
        title: CATEGORY_BY_ID[cat as keyof typeof CATEGORY_BY_ID]?.label ?? cat,
        columns: ['Name', 'Type', 'Addresses', 'OS / product', 'Runs on', 'Services', 'Location', 'Description'],
        rows: list.map((n) => {
          const def = getDefinition(n.data.type);
          const p = n.data.props;
          const parent = n.parentId ? byId.get(n.parentId) : undefined;
          const host = parent && isDevice(parent) ? parent.data.name : '';
          return [
            n.data.name,
            def.label,
            allIps(p)
              .filter((a) => a.address)
              .map((a) => `${a.address}${a.label ? ` (${a.label}${a.vlan ? `, VLAN ${a.vlan}` : ''})` : a.vlan ? ` (VLAN ${a.vlan})` : ''}`)
              .join(', '),
            [formatOs(p.os, p.osVersion), str(p.product), str(p.model)].filter(Boolean).join(' · '),
            host,
            servicesOf(p)
              .map((s) => SERVICE_BY_ID.get(s)?.label ?? s)
              .join(', '),
            str(p.location),
            str(p.description),
          ];
        }),
      }));
      return { id: 'inventory', title: 'Inventory', tables, empty: 'No device in the diagram.' };
    },

    addressing: () => {
      const all = nodes.flatMap((n) => allIps(n.data.props).filter((a) => a.address).map((a) => ({ ...a, node: n })));
      const tables: DocTable[] = [];
      for (const v of [...vlans].sort((a, b) => a.id - b.id)) {
        const inside = all.filter((a) => a.vlan === String(v.id) || (!a.vlan && v.subnet && ipInCidr(a.address, v.subnet)));
        const c = parseCidr(v.subnet);
        const capacity = c ? Math.max(0, 2 ** (32 - c.prefix) - 2) : 0;
        const rows = inside
          .sort((a, b) => ipKey(a.address) - ipKey(b.address))
          .map((a) => [a.address, a.node.data.name, a.label ?? '', a.address === v.gateway ? 'Gateway' : '']);
        if (v.gateway && !inside.some((a) => a.address === v.gateway)) rows.unshift([v.gateway, '—', '', 'Gateway (not on the diagram)']);
        tables.push({
          title: `VLAN ${v.id} · ${v.name}${v.subnet ? ` — ${v.subnet}` : ''}`,
          note: capacity ? `${inside.length} of ${capacity} host addresses used (${((inside.length / capacity) * 100).toFixed(capacity > 1000 ? 2 : 1)} %).` : undefined,
          columns: ['Address', 'Device', 'Interface', 'Note'],
          rows,
        });
      }
      const outside = all.filter((a) => !vlans.some((v) => a.vlan === String(v.id) || (!a.vlan && v.subnet && ipInCidr(a.address, v.subnet))));
      if (outside.length)
        tables.push({
          title: 'Other addresses',
          columns: ['Address', 'Device', 'Interface', 'Note'],
          rows: outside.sort((a, b) => ipKey(a.address) - ipKey(b.address)).map((a) => [a.address, a.node.data.name, a.label ?? '', a.vlan ? `VLAN ${a.vlan} (undefined)` : '']),
        });
      return { id: 'addressing', title: 'Addressing plan', tables, empty: 'No IP address in the diagram.' };
    },

    vlans: () => ({
      id: 'vlans',
      title: 'VLANs',
      tables: vlans.length
        ? [
            {
              columns: ['ID', 'Name', 'Subnet', 'Gateway', 'Devices', 'Links carrying it', 'Description'],
              rows: [...vlans]
                .sort((a, b) => a.id - b.id)
                .map((v) => {
                  const id = String(v.id);
                  const users = nodes.filter((n) => allIps(n.data.props).some((a) => a.vlan === id) || str(n.data.props.vlan) === id).length;
                  const carried = physical.filter((e) => (e.data?.vlan ?? '').split(/[\s,]+/).includes(id)).length;
                  return [id, v.name, v.subnet ?? '', v.gateway ?? '', String(users), String(carried), v.description ?? ''];
                }),
            },
          ]
        : [],
      empty: 'No VLAN defined.',
    }),

    links: () => ({
      id: 'links',
      title: 'Physical links',
      tables: physical.length
        ? [
            {
              columns: ['From', 'Port', 'To', 'Port', 'Type', 'Speed', 'Mode', 'VLANs', 'Bond'],
              rows: physical
                .map((e) => {
                  const d = e.data;
                  const bond = d?.bondId ? bonds.find((b) => b.id === d.bondId) : undefined;
                  return [name(e.source), d?.sourcePort ?? '', name(e.target), d?.targetPort ?? '', d?.connType ?? 'ethernet', d?.speed ?? '', d?.mode ?? '', d?.vlan ?? '', bond ? bond.name : ''];
                })
                .sort((a, b) => cmpId(a[0], b[0]) || cmpId(a[2], b[2])),
            },
          ]
        : [],
      empty: 'No physical link.',
    }),

    bonds: () => ({
      id: 'bonds',
      title: 'Bonds & aggregates',
      tables: bonds.length
        ? [
            {
              columns: ['Name', 'Peer name', 'Mode', 'Between', 'Members', 'Capacity'],
              rows: bonds.map((b) => {
                const members = bondMembers(b.id, edges);
                const ends = [...new Set(members.flatMap((m) => [name(m.source), name(m.target)]))].join(' ↔ ');
                const info = modeInfo(b.mode);
                return [b.name, b.peerName ?? '', info.label, ends, String(members.length), bondCapacity(info, members)];
              }),
            },
          ]
        : [],
      empty: 'No bond.',
    }),

    firewall: () => {
      const tables: DocTable[] = nodes
        .filter((n) => hasRules(n) && rulesOf(n.data.props).length)
        .map((n) => ({
          title: `${n.data.name}${str(n.data.props.fwPolicy) ? ` — ${str(n.data.props.fwPolicy)}` : ''}`,
          note: str(n.data.props.fwProduct) || str(n.data.props.product) || undefined,
          columns: ['#', 'Action', 'Direction', 'Source', 'Destination', 'Protocol', 'Ports', 'Comment'],
          rows: rulesOf(n.data.props).map((r, i) => {
            const addr = (v: string) => {
              const res = resolveAddress(v, nodes, vlans);
              return res.kind === 'vlan' || res.kind === 'node' ? `${res.label}${res.detail ? ` (${res.detail})` : ''}` : res.label;
            };
            return [String(i + 1), `${r.action}${r.enabled ? '' : ' (disabled)'}`, r.direction, addr(r.source), addr(r.destination), r.protocol, formatPorts(r), r.comment ?? ''];
          }),
        }));
      return { id: 'firewall', title: 'Firewall rules', intro: 'Rules are evaluated from top to bottom; the first match wins.', tables, empty: 'No firewall rule.' };
    },

    flows: () => ({
      id: 'flows',
      title: 'Flows & dependencies',
      tables: flows.length
        ? [
            {
              columns: ['From', 'To', 'Type', 'Label'],
              rows: flows.map((e) => [name(e.source), name(e.target), e.data?.connType === 'vpn' ? 'VPN tunnel' : e.data?.connType === 'arrow' ? 'Flow' : 'Dependency', e.data?.label ?? '']),
            },
          ]
        : [],
      empty: 'No flow or dependency drawn.',
    }),

    issues: () => ({
      id: 'issues',
      title: 'Validation issues',
      tables: issues.length
        ? [
            {
              columns: ['Severity', 'Issue'],
              rows: [...issues]
                .sort((a, b) => ['error', 'warning', 'info'].indexOf(a.severity) - ['error', 'warning', 'info'].indexOf(b.severity))
                .map((i) => [i.severity, i.message]),
            },
          ]
        : [],
      empty: 'No issue: the diagram passes every check.',
    }),
  };

  for (const s of DOC_SECTIONS) if (sections.includes(s.id)) out.push(build[s.id]());
  return { title: input.name, description: input.description, generatedAt: now.toISOString(), sections: out };
}
