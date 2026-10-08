import { getDefinition } from '../../data/catalog';
import type { InfraEdge, InfraNode, LayerId, NodeRole, ProjectSettings, ViewPreset, ViewSettings } from '../../types';
import { nodeIndex } from '../nodes/hierarchy';
import { childTop, hasHostFirewall, hasVpn } from '../nodes/ips';
import { hasRules, rulesOf } from '../firewall/rules';

/**
 * Views and layers: show the same diagram from different angles without
 * changing it. Every node and link belongs to one layer; a view is a set of
 * hidden layers (and, for the security view, dimmed elements).
 */
export type { LayerId, ViewPreset, ViewSettings };

export const LAYERS: { id: LayerId; label: string; group: 'Elements' | 'Links' }[] = [
  { id: 'network', label: 'Network equipment', group: 'Elements' },
  { id: 'compute', label: 'Servers, storage & services', group: 'Elements' },
  { id: 'virtual', label: 'VMs & containers', group: 'Elements' },
  { id: 'endpoints', label: 'Endpoints & users', group: 'Elements' },
  { id: 'security', label: 'Security appliances', group: 'Elements' },
  { id: 'zones', label: 'Zones, VLANs & groups', group: 'Elements' },
  { id: 'rules', label: 'Firewall rules tables', group: 'Elements' },
  { id: 'notes', label: 'Notes & labels', group: 'Elements' },
  { id: 'cabling', label: 'Cabling (Ethernet, fiber, Wi-Fi, WAN)', group: 'Links' },
  { id: 'tunnels', label: 'VPN tunnels', group: 'Links' },
  { id: 'flows', label: 'Flows & dependencies', group: 'Links' },
];

export const VIEW_PRESETS: { id: Exclude<ViewPreset, 'custom'>; label: string; description: string; hidden: LayerId[] }[] = [
  { id: 'all', label: 'Everything', description: 'The whole diagram.', hidden: [] },
  { id: 'physical', label: 'Physical', description: 'Hardware and cabling: no guests, zones, flows or tunnels.', hidden: ['virtual', 'zones', 'flows', 'tunnels', 'rules'] },
  { id: 'network', label: 'Network', description: 'VLANs, addressing, links and tunnels, without application flows.', hidden: ['flows', 'rules'] },
  { id: 'applications', label: 'Applications', description: 'Servers, VMs, containers and their flows.', hidden: ['network', 'endpoints', 'cabling', 'tunnels', 'rules'] },
  { id: 'security', label: 'Security', description: 'Firewalls, host firewalls, VPN, DMZ and rules; the rest is dimmed.', hidden: ['flows'] },
];

export const DEFAULT_VIEW: ViewSettings = { preset: 'all', hidden: [] };

const ROLE_LAYER: Partial<Record<NodeRole, LayerId>> = {
  wan: 'network',
  cloud: 'network',
  router: 'network',
  firewall: 'network',
  'core-switch': 'network',
  switch: 'network',
  ap: 'network',
  vpn: 'network',
  'load-balancer': 'compute',
  server: 'compute',
  storage: 'compute',
  hypervisor: 'compute',
  vm: 'virtual',
  lxc: 'virtual',
  'docker-host': 'virtual',
  'docker-container': 'virtual',
  bridge: 'virtual',
  endpoint: 'endpoints',
  security: 'security',
};

export function layerOfNode(n: InfraNode): LayerId {
  if (n.data.type === 'fw-table') return 'rules';
  if (n.data.type === 'docker-network') return 'virtual';
  const def = getDefinition(n.data.type);
  if (def.kind === 'annotation') return 'notes';
  if (def.kind === 'zone' || def.kind === 'container') return ROLE_LAYER[def.role] ?? 'zones';
  return ROLE_LAYER[def.role] ?? 'compute';
}

export function layerOfEdge(e: InfraEdge): LayerId {
  const t = e.data?.connType ?? 'ethernet';
  if (t === 'vpn') return 'tunnels';
  if (t === 'logical' || t === 'arrow') return 'flows';
  return 'cabling';
}

/** What the security view keeps lit: filtering, tunnels, exposure. */
export function isSecurityRelevant(n: InfraNode): boolean {
  const role = getDefinition(n.data.type).role;
  if (role === 'firewall' || role === 'security' || role === 'vpn') return true;
  if (n.data.type === 'fw-table' || n.data.type === 'dmz') return true;
  return hasHostFirewall(n) || hasVpn(n) || (hasRules(n) && rulesOf(n.data.props).length > 0);
}

export function viewOf(settings: ProjectSettings): ViewSettings {
  return settings.view ?? DEFAULT_VIEW;
}

export const isFiltered = (v: ViewSettings) => v.hidden.length > 0 || v.preset === 'security';

// Display copies are cached per element so unchanged elements keep their identity (no re-render).
const nodeCopies = new WeakMap<InfraNode, { key: string; node: InfraNode }>();
const edgeCopies = new WeakMap<InfraEdge, { key: string; edge: InfraEdge }>();

function nodeVariant(n: InfraNode, hidden: boolean, dim: boolean, collapse: boolean, byId: Map<string, InfraNode>): InfraNode {
  if (!hidden && !dim && !collapse) return n;
  const key = hidden ? 'h' : `${dim ? 'd' : ''}${collapse ? 'c' : ''}`;
  const cached = nodeCopies.get(n);
  if (cached?.key === key) return cached.node;
  const node: InfraNode = hidden ? { ...n, hidden: true } : { ...n, className: dim ? [n.className, 'view-dim'].filter(Boolean).join(' ') : n.className };
  // A host whose guests are all hidden shrinks to its header.
  if (collapse) node.height = childTop(n, false, byId) - 4;
  nodeCopies.set(n, { key, node });
  return node;
}

function edgeVariant(e: InfraEdge, hidden: boolean, dim: boolean): InfraEdge {
  if (!hidden && !dim) return e;
  const key = hidden ? 'h' : 'd';
  const cached = edgeCopies.get(e);
  if (cached?.key === key) return cached.edge;
  const edge = hidden ? { ...e, hidden: true } : { ...e, data: { ...e.data!, _focus: 'muted' } };
  edgeCopies.set(e, { key, edge });
  return edge;
}

let lastCount: { nodes: InfraNode[]; edges: InfraEdge[]; view: ViewSettings; hidden: number } | null = null;

/** Number of elements and links the view hides (memoized on the last arguments). */
export function hiddenCount(nodes: InfraNode[], edges: InfraEdge[], view: ViewSettings): number {
  if (lastCount && lastCount.nodes === nodes && lastCount.edges === edges && lastCount.view === view) return lastCount.hidden;
  const hidden = applyView(nodes, edges, view).hidden;
  lastCount = { nodes, edges, view, hidden };
  return hidden;
}

/** The diagram as the current view shows it. The project itself is never modified. */
export function applyView(nodes: InfraNode[], edges: InfraEdge[], view: ViewSettings): { nodes: InfraNode[]; edges: InfraEdge[]; hidden: number } {
  if (!isFiltered(view)) return { nodes, edges, hidden: 0 };
  const hiddenLayers = new Set(view.hidden);
  const security = view.preset === 'security';
  const hiddenIds = new Set<string>();
  const lit = new Set<string>();
  const visibleChildren = new Map<string, number>();
  for (const n of nodes) {
    const hidden = hiddenLayers.has(layerOfNode(n));
    if (hidden) hiddenIds.add(n.id);
    if (n.parentId) visibleChildren.set(n.parentId, (visibleChildren.get(n.parentId) ?? 0) + (hidden ? 0 : 1));
  }
  const byId = nodeIndex(nodes).byId;
  const outNodes = nodes.map((n) => {
    const hidden = hiddenIds.has(n.id);
    const relevant = security && !hidden && isSecurityRelevant(n);
    if (relevant) lit.add(n.id);
    const collapse = !hidden && getDefinition(n.data.type).kind === 'container' && visibleChildren.get(n.id) === 0;
    return nodeVariant(n, hidden, security && !hidden && !relevant, collapse, byId);
  });
  let hiddenEdges = 0;
  const outEdges = edges.map((e) => {
    const hidden = hiddenLayers.has(layerOfEdge(e)) || hiddenIds.has(e.source) || hiddenIds.has(e.target);
    if (hidden) hiddenEdges++;
    // Security view: links of the filtering devices and tunnels stay lit.
    const dim = security && !hidden && !(lit.has(e.source) || lit.has(e.target) || layerOfEdge(e) === 'tunnels');
    return edgeVariant(e, hidden, dim);
  });
  return { nodes: outNodes, edges: outEdges, hidden: hiddenIds.size + hiddenEdges };
}
