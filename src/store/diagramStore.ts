import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type XYPosition,
} from '@xyflow/react';
import { create } from 'zustand';
import { canContain, definitionHasField, getDefinition, getPreset } from '../data/catalog';
import { getOperatingSystem, setCustomOperatingSystems } from '../data/operatingSystems';
import { TEMPLATES } from '../data/templates';
import { VLAN_COLORS } from '../data/templates/builder';
import { migrateLegacyBonds, pruneBonds, suggestBondNames } from '../features/connections/bonds';
import { parallelEdges } from '../features/connections/parallel';
import { suggestConnection } from '../features/connections/suggest';
import { autoLayout, relayoutContainer } from '../features/layout/autoLayout';
import { createNode, createNodeFromPreset, withLayer } from '../features/nodes/factory';
import { childTop, COMPACT_ROW, COMPACT_WIDTH, defaultInterface, fitDeviceHeight, headerHeight, inCompactHost, managedAncestors } from '../features/nodes/ips';
import {
  absolutePosition,
  depthOf,
  descendantIds,
  findContainerAt,
  fitContainersToChildren,
  indexById,
  nodeSize,
  reparentNode,
  shrinkAncestors,
  sortByHierarchy,
} from '../features/nodes/hierarchy';
import {
  alignNodes,
  copyToClipboard,
  distributeNodes,
  groupNodes,
  pasteClipboard,
  selectionRoots,
  suggestIp,
  ungroupNode,
  type AlignMode,
  type ClipboardData,
} from '../features/nodes/operations';
import { DEFAULT_SETTINGS, fromProjectFile, toProjectFile, type DiagramContent } from '../features/projects/serialization';
import { saveProjectFile } from '../features/projects/storage';
import { flowApi } from '../features/canvas/flowApi';
import { cardFieldsAbove } from '../features/nodes/groupDisplay';
import type {
  Bond,
  ConnectionType,
  IpEntry,
  InfraEdge,
  InfraEdgeData,
  InfraNode,
  InfraNodeData,
  LayoutAlgorithm,
  LibraryPreset,
  OperatingSystem,
  ProjectFile,
  ProjectMetadata,
  ProjectSettings,
  Vlan,
} from '../types';
import { str, uid } from '../utils/misc';
import { zoneSubnet } from '../features/validation/validate';

interface Snapshot {
  nodes: InfraNode[];
  edges: InfraEdge[];
  vlans: Vlan[];
  bonds: Bond[];
}

const HISTORY_LIMIT = 100;

export interface DiagramState {
  metadata: ProjectMetadata;
  nodes: InfraNode[];
  edges: InfraEdge[];
  vlans: Vlan[];
  bonds: Bond[];
  customOs: OperatingSystem[];
  settings: ProjectSettings;
  past: Snapshot[];
  future: Snapshot[];
  dirty: boolean;
  savedAt: string | null;
  clipboard: ClipboardData | null;
  defaultConnType: ConnectionType | 'auto';
  /** Increments to ask the canvas to fit the view. */
  fitRequest: number;

  onNodesChange: (changes: NodeChange<InfraNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<InfraEdge>[]) => void;
  onConnect: (c: Connection) => void;

  checkpoint: (key?: string) => void;
  undo: () => void;
  redo: () => void;

  addPreset: (preset: LibraryPreset, at: XYPosition) => string | null;
  addChild: (parentId: string, type: string) => string | null;
  addNode: (type: string, at: XYPosition, props?: Record<string, unknown>) => string;
  updateNode: (id: string, patch: Partial<InfraNodeData>) => void;
  updateNodeProps: (id: string, patch: Record<string, unknown>) => void;
  applyOs: (id: string, osId: string) => void;
  deleteSelection: () => void;
  deleteElements: (nodeIds: string[], edgeIds?: string[]) => void;
  duplicateSelection: () => void;
  copySelection: () => void;
  cutSelection: () => void;
  paste: (at?: XYPosition) => void;
  selectAll: () => void;
  clearSelection: () => void;
  select: (nodeIds: string[], edgeIds?: string[]) => void;
  groupSelection: () => void;
  ungroup: (id: string) => void;
  toggleLock: (ids: string[]) => void;
  /** Show the guests of a host as compact lines (and nested hosts as compact blocks). */
  setCompact: (id: string, on: boolean) => void;
  /** Re-arrange the compact hosts and arranged groups containing these nodes. */
  refreshCompact: (ids: string[]) => void;
  handleDragStop: (ids: string[]) => void;
  detachFromParent: (id: string) => void;
  align: (mode: AlignMode) => void;
  distribute: (axis: 'horizontal' | 'vertical') => void;
  applyLayout: (algorithm: LayoutAlgorithm) => void;
  bringToFront: (ids: string[]) => void;
  sendToBack: (ids: string[]) => void;

  updateEdge: (id: string, patch: Partial<InfraEdgeData>) => void;
  reverseEdge: (id: string) => void;
  /** Duplicate a link between the same devices on the next free ports. */
  addParallelLink: (id: string) => void;
  /** Create an aggregate / redundancy group from links (they may join different devices). */
  createBond: (edgeIds: string[], partial?: Partial<Bond>) => string | null;
  updateBond: (id: string, patch: Partial<Bond>) => void;
  addToBond: (bondId: string, edgeIds: string[]) => void;
  removeFromBond: (edgeIds: string[]) => void;
  /** Dissolve an aggregate; its links are kept. */
  deleteBond: (id: string) => void;
  setDefaultConnType: (t: ConnectionType | 'auto') => void;

  addVlan: (partial?: Partial<Vlan>) => Vlan;
  updateVlan: (uid: string, patch: Partial<Vlan>) => void;
  removeVlan: (uid: string) => void;
  placeVlanZone: (uid: string, at?: XYPosition) => void;

  addCustomOs: (os: OperatingSystem) => void;
  removeCustomOs: (id: string) => void;

  loadContent: (c: DiagramContent) => void;
  newProject: (templateId: string, name?: string) => void;
  importFile: (raw: unknown) => void;
  exportFile: () => ProjectFile;
  /** Save locally; `version` also records it in the history (autosaves: at most every few minutes). */
  save: (version?: 'auto' | 'manual' | 'none') => void;
  saveAs: (name: string) => void;
  renameProject: (name: string) => void;
  setDescription: (d: string) => void;
  setSettings: (patch: Partial<ProjectSettings>) => void;
}

const now = () => new Date().toISOString();

function newMetadata(name: string): ProjectMetadata {
  const t = now();
  return { id: crypto.randomUUID(), name, createdAt: t, updatedAt: t };
}

function snapshot(s: Pick<DiagramState, 'nodes' | 'edges' | 'vlans' | 'bonds'>): Snapshot {
  return {
    nodes: s.nodes.map((n) => ({ ...n, selected: false, dragging: false })),
    edges: s.edges.map((e) => ({ ...e, selected: false })),
    vlans: s.vlans,
    bonds: s.bonds,
  };
}

function withLockFlags(n: InfraNode): InfraNode {
  const locked = !!n.data.locked;
  return withLayer({ ...n, draggable: locked ? false : undefined, deletable: locked ? false : undefined });
}

let lastCheckpoint = { key: '', time: 0 };

/** Settings shared by parallel links (type, speed, VLANs, bond); ports stay per-link. */
function inheritParallel(sibling: InfraEdge, suggested: InfraEdgeData): InfraEdgeData {
  const d = sibling.data ?? { connType: 'ethernet' };
  return { ...suggested, connType: d.connType, speed: d.speed, mode: d.mode, vlan: d.vlan };
}

/** Rename (or clear) a VLAN reference on a node: main VLAN and additional addresses. */
function remapNodeVlan(n: InfraNode, from: string, to: string): InfraNode {
  const props = { ...n.data.props };
  let changed = false;
  if (str(props.vlan) === from) {
    props.vlan = to;
    changed = true;
  }
  if (Array.isArray(props.ips)) {
    props.ips = (props.ips as IpEntry[]).map((e) => (e && str(e.vlan) === from ? ((changed = true), { ...e, vlan: to }) : e));
  }
  return changed ? { ...n, data: { ...n.data, props } } : n;
}

/** Give pasted links their own copies of the bonds they belonged to. */
function cloneBonds(newEdges: InfraEdge[], bonds: Bond[]): { edges: InfraEdge[]; bonds: Bond[] } {
  const map = new Map<string, Bond>();
  const edges = newEdges.map((e) => {
    const old = e.data?.bondId;
    if (!old) return e;
    const src = bonds.find((b) => b.id === old);
    if (!src) return { ...e, data: { ...e.data!, bondId: undefined } };
    if (!map.has(old)) map.set(old, { ...src, id: uid('b_') });
    return { ...e, data: { ...e.data!, bondId: map.get(old)!.id } };
  });
  return { edges, bonds: [...bonds, ...map.values()] };
}

export const useDiagram = create<DiagramState>((set, get) => {
  /** Set nodes, keeping hierarchy order. */
  const commitNodes = (nodes: InfraNode[], extra: Partial<DiagramState> = {}) =>
    set({ nodes: sortByHierarchy(nodes), dirty: true, ...extra });

  const selectedIds = () => new Set(get().nodes.filter((n) => n.selected).map((n) => n.id));

  /** Inherit VLAN / suggest IP when a node lands in a zone or host. */
  const inheritFromParent = (node: InfraNode, nodes: InfraNode[]): InfraNode => {
    if (!node.parentId) return node;
    const parent = nodes.find((n) => n.id === node.parentId);
    if (!parent) return node;
    const def = getDefinition(node.data.type);
    const props = { ...node.data.props };
    const parentVlan = str(parent.data.props.vlan);
    if (definitionHasField(def, 'vlan') && !str(props.vlan) && parentVlan && node.data.type !== 'docker-container') {
      props.vlan = parentVlan;
    }
    if (definitionHasField(def, 'ip') && !str(props.ip)) {
      const subnet = getDefinition(parent.data.type).kind === 'zone' ? zoneSubnet(parent, get().vlans) : '';
      const vlanSubnet = get().vlans.find((v) => String(v.id) === str(props.vlan))?.subnet ?? '';
      const ip = suggestIp(subnet || vlanSubnet, nodes);
      if (ip) {
        props.ip = ip;
        if (!str(props.ipLabel)) props.ipLabel = defaultInterface(node, 0, str(props.vlan));
      }
    }
    return { ...node, data: { ...node.data, props } };
  };

  /** Card height for what the group around it shows. */
  const fitCard = (node: InfraNode, nodes: InfraNode[]): InfraNode => fitDeviceHeight(node, cardFieldsAbove(node.parentId, indexById(nodes)));

  /**
   * Refit the cards of these nodes and everything inside them (their group
   * changed, or what it shows). Returns the nodes and the refitted ids.
   */
  const refitCards = (nodes: InfraNode[], ids: string[]): { nodes: InfraNode[]; changed: string[] } => {
    const scope = new Set<string>();
    for (const id of ids) {
      scope.add(id);
      for (const d of descendantIds(id, nodes)) scope.add(d);
    }
    const byId = indexById(nodes);
    const changed: string[] = [];
    const out = nodes.map((n) => {
      // Compact lines have their own size.
      if (!scope.has(n.id) || getDefinition(n.data.type).kind !== 'device' || inCompactHost(n, byId)) return n;
      const next = fitDeviceHeight(n, cardFieldsAbove(n.parentId, byId));
      if (next !== n) changed.push(n.id);
      return next;
    });
    return { nodes: changed.length ? out : nodes, changed };
  };

  return {
    metadata: newMetadata('Untitled project'),
    nodes: [],
    edges: [],
    vlans: [],
    bonds: [],
    customOs: [],
    settings: DEFAULT_SETTINGS,
    past: [],
    future: [],
    dirty: false,
    savedAt: null,
    clipboard: null,
    defaultConnType: 'auto',
    fitRequest: 0,

    /* ------------------------------------------------------------ */
    /* React Flow                                                    */
    /* ------------------------------------------------------------ */
    onNodesChange: (changes) => {
      // Measurements are not user edits; moves and resizes are.
      const edited = changes.some((c) => c.type === 'position' || (c.type === 'dimensions' && c.resizing));
      set({ nodes: applyNodeChanges(changes, get().nodes), ...(edited ? { dirty: true } : {}) });
    },
    onEdgesChange: (changes) => {
      set({ edges: applyEdgeChanges(changes, get().edges) });
    },
    onConnect: (c) => {
      if (!c.source || !c.target || c.source === c.target) return;
      const { nodes, edges, defaultConnType } = get();
      const source = nodes.find((n) => n.id === c.source);
      const target = nodes.find((n) => n.id === c.target);
      if (!source || !target) return;
      get().checkpoint();
      let data = suggestConnection(source, target, edges, defaultConnType === 'auto' ? undefined : defaultConnType);
      // Another link between the same devices (redundancy / bond): reuse its settings, next free ports.
      const sibling = parallelEdges(edges, { source: c.source, target: c.target })[0];
      if (sibling?.data) data = inheritParallel(sibling, data);
      const edge: InfraEdge = { id: uid('e_'), type: 'network', source: c.source, target: c.target, data, selected: true };
      set({
        edges: [...edges.map((e) => ({ ...e, selected: false })), edge],
        nodes: nodes.map((n) => (n.selected ? { ...n, selected: false } : n)),
        dirty: true,
      });
    },

    /* ------------------------------------------------------------ */
    /* History                                                       */
    /* ------------------------------------------------------------ */
    checkpoint: (key) => {
      const t = Date.now();
      if (key && key === lastCheckpoint.key && t - lastCheckpoint.time < 1200) {
        lastCheckpoint.time = t;
        return;
      }
      lastCheckpoint = { key: key ?? '', time: t };
      const past = [...get().past, snapshot(get())].slice(-HISTORY_LIMIT);
      set({ past, future: [], dirty: true });
    },
    undo: () => {
      const { past, future } = get();
      const prev = past[past.length - 1];
      if (!prev) return;
      lastCheckpoint = { key: '', time: 0 };
      set({ past: past.slice(0, -1), future: [snapshot(get()), ...future], ...prev, dirty: true });
    },
    redo: () => {
      const { past, future } = get();
      const next = future[0];
      if (!next) return;
      lastCheckpoint = { key: '', time: 0 };
      set({ past: [...past, snapshot(get())], future: future.slice(1), ...next, dirty: true });
    },

    /* ------------------------------------------------------------ */
    /* Nodes                                                         */
    /* ------------------------------------------------------------ */
    addPreset: (preset, at) => {
      const { nodes } = get();
      const def = getDefinition(preset.type);
      // Dropping an OS onto an existing node applies it.
      if (preset.osId) {
        const byId = indexById(nodes);
        const hit = nodes
          .filter((n) => definitionHasField(getDefinition(n.data.type), 'os'))
          .reverse()
          .find((n) => {
            const p = absolutePosition(n, byId);
            const s = nodeSize(n);
            return at.x >= p.x && at.y >= p.y && at.x <= p.x + s.width && at.y <= p.y + s.height;
          });
        if (hit) {
          get().applyOs(hit.id, preset.osId);
          get().select([hit.id]);
          return hit.id;
        }
      }
      get().checkpoint();
      const center = at;
      const parent = findContainerAt(center, nodes, preset.type);
      const byId = indexById(nodes);
      let position = { x: center.x - def.size.width / 2, y: center.y - def.size.height / 2 };
      if (parent) {
        const pAbs = absolutePosition(parent, byId);
        position = { x: Math.max(16, position.x - pAbs.x), y: Math.max(childTop(parent) - 4, position.y - pAbs.y) };
      }
      let node = createNodeFromPreset(preset, {
        position,
        parentId: parent?.id,
        existingNames: nodes.map((n) => n.data.name),
      });
      node = fitCard(inheritFromParent(node, nodes), nodes);
      node.selected = true;
      const next = fitContainersToChildren([...nodes.map((n) => ({ ...n, selected: false })), node]);
      commitNodes(next, { edges: get().edges.map((e) => ({ ...e, selected: false })) });
      get().refreshCompact([node.id]);
      return node.id;
    },

    addNode: (type, at, props) => {
      get().checkpoint();
      const def = getDefinition(type);
      const node = createNode(type, {
        position: { x: at.x - def.size.width / 2, y: at.y - def.size.height / 2 },
        existingNames: get().nodes.map((n) => n.data.name),
        props,
      });
      node.selected = true;
      commitNodes([...get().nodes.map((n) => ({ ...n, selected: false })), node]);
      return node.id;
    },

    addChild: (parentId, type) => {
      const { nodes } = get();
      const parent = nodes.find((n) => n.id === parentId);
      if (!parent || !canContain(parent.data.type, type)) return null;
      get().checkpoint();
      const def = getDefinition(type);
      const siblings = nodes.filter((n) => n.parentId === parentId);
      const { width } = nodeSize(parent);
      // Place after the last sibling, wrapping like a grid.
      const GAP = 16;
      let x = 24;
      let y = childTop(parent);
      if (siblings.length) {
        const lastRowY = Math.max(...siblings.map((s) => s.position.y));
        const lastRow = siblings.filter((s) => s.position.y === lastRowY);
        const right = Math.max(...lastRow.map((s) => s.position.x + nodeSize(s).width));
        if (right + GAP + def.size.width <= width - 20) {
          x = right + GAP;
          y = lastRowY;
        } else {
          y = Math.max(...siblings.map((s) => s.position.y + nodeSize(s).height)) + GAP;
        }
      }
      const preset = getPreset(type);
      let node = createNode(type, {
        position: { x, y },
        parentId,
        existingNames: nodes.map((n) => n.data.name),
        props: preset?.props,
      });
      node = fitCard(inheritFromParent(node, nodes), nodes);
      node.selected = true;
      commitNodes(fitContainersToChildren([...nodes.map((n) => ({ ...n, selected: false })), node]));
      get().refreshCompact([node.id]);
      return node.id;
    },

    updateNode: (id, patch) => {
      get().checkpoint(`node:${id}:${Object.keys(patch).join(',')}`);
      set({
        nodes: get().nodes.map((n) => (n.id === id ? withLockFlags({ ...n, data: { ...n.data, ...patch } }) : n)),
        dirty: true,
      });
    },

    updateNodeProps: (id, patch) => {
      get().checkpoint(`props:${id}:${Object.keys(patch).join(',')}`);
      const before = get().nodes.find((n) => n.id === id);
      const oldHeader = before ? headerHeight(before) : 0;
      set({
        nodes: get().nodes.map((n) => {
          if (n.id !== id) return n;
          const next = { ...n, data: { ...n.data, props: { ...n.data.props, ...patch } } };
          return ['ips', 'fw', 'vpn', 'wifi', 'services', 'display', 'vpnIp', 'vpnProtocol', 'vpnMode', 'vpnEndpoint', 'vpnNetwork', 'ssid', 'band', 'wifiStandard', 'wifiSecurity'].some((k) => k in patch)
            ? fitCard(next, get().nodes)
            : next;
        }),
        dirty: true,
      });
      // A group changed what its cards show: they take their new height.
      if ('cardFields' in patch) {
        const { nodes, changed } = refitCards(get().nodes, [id]);
        if (changed.length) {
          set({ nodes: fitContainersToChildren(nodes) });
          get().refreshCompact(changed);
        }
      }
      if (managedAncestors(id, indexById(get().nodes)).length) {
        get().refreshCompact([id]);
        return;
      }
      // A host header that grew (more stacked addresses) pushes its guests down.
      const after = get().nodes.find((n) => n.id === id);
      const delta = after ? headerHeight(after) - oldHeader : 0;
      if (delta !== 0 && after) {
        set({
          nodes: get().nodes.map((n) => {
            if (n.parentId === id) return { ...n, position: { ...n.position, y: n.position.y + delta } };
            if (n.id === id) return { ...n, height: Math.max(140, (n.height ?? nodeSize(n).height) + delta), measured: undefined };
            return n;
          }),
        });
      }
    },

    applyOs: (id, osId) => {
      const os = getOperatingSystem(osId);
      if (!os) return;
      const latest = os.versions[os.versions.length - 1]?.id ?? '';
      get().updateNodeProps(id, { os: osId, osVersion: latest });
    },

    deleteElements: (nodeIds, edgeIds = []) => {
      const { nodes, edges } = get();
      const removable = nodeIds.filter((id) => !nodes.find((n) => n.id === id)?.data.locked);
      const toRemove = new Set<string>();
      for (const id of removable) {
        toRemove.add(id);
        for (const d of descendantIds(id, nodes)) toRemove.add(d);
      }
      const edgeSet = new Set(edgeIds);
      if (!toRemove.size && !edgeSet.size) return;
      get().checkpoint();
      const remaining = edges.filter((e) => !edgeSet.has(e.id) && !toRemove.has(e.source) && !toRemove.has(e.target));
      const hosts = nodes.filter((n) => toRemove.has(n.id) && n.parentId && !toRemove.has(n.parentId)).map((n) => n.parentId!);
      set({
        nodes: nodes.filter((n) => !toRemove.has(n.id)),
        edges: remaining,
        bonds: pruneBonds(get().bonds, remaining),
        dirty: true,
      });
      get().refreshCompact(hosts);
    },

    deleteSelection: () => {
      const { nodes, edges } = get();
      get().deleteElements(
        nodes.filter((n) => n.selected).map((n) => n.id),
        edges.filter((e) => e.selected).map((e) => e.id),
      );
    },

    copySelection: () => {
      const clip = copyToClipboard(get().nodes, get().edges, selectedIds());
      if (clip) set({ clipboard: clip });
    },

    cutSelection: () => {
      get().copySelection();
      get().deleteSelection();
    },

    paste: (at) => {
      const clip = get().clipboard;
      if (!clip) return;
      get().checkpoint();
      const result = pasteClipboard(get().nodes, get().edges, clip, at ? { at } : { offset: { x: 40, y: 40 } });
      // Next paste is offset again from the previous one.
      if (!at) {
        const shifted = clip.nodes.map((n) =>
          !n.parentId || !clip.nodes.some((p) => p.id === n.parentId) ? { ...n, position: { x: n.position.x + 40, y: n.position.y + 40 } } : n,
        );
        set({ clipboard: { ...clip, nodes: shifted } });
      }
      const known = new Set(get().edges.map((e) => e.id));
      const cloned = cloneBonds(result.edges.filter((e) => !known.has(e.id)), get().bonds);
      set({ nodes: result.nodes, edges: [...result.edges.filter((e) => known.has(e.id)), ...cloned.edges], bonds: cloned.bonds, dirty: true });
    },

    duplicateSelection: () => {
      const clip = copyToClipboard(get().nodes, get().edges, selectedIds());
      if (!clip) return;
      get().checkpoint();
      const result = pasteClipboard(get().nodes, get().edges, clip, { offset: { x: 32, y: 32 }, keepParent: true });
      const known = new Set(get().edges.map((e) => e.id));
      const cloned = cloneBonds(result.edges.filter((e) => !known.has(e.id)), get().bonds);
      commitNodes(fitContainersToChildren(result.nodes), {
        edges: [...result.edges.filter((e) => known.has(e.id)), ...cloned.edges],
        bonds: cloned.bonds,
      });
      get().refreshCompact(result.newIds);
    },

    selectAll: () =>
      set({ nodes: get().nodes.map((n) => ({ ...n, selected: true })), edges: get().edges.map((e) => ({ ...e, selected: true })) }),
    clearSelection: () =>
      set({ nodes: get().nodes.map((n) => (n.selected ? { ...n, selected: false } : n)), edges: get().edges.map((e) => (e.selected ? { ...e, selected: false } : e)) }),
    select: (nodeIds, edgeIds = []) => {
      const ns = new Set(nodeIds);
      const es = new Set(edgeIds);
      set({
        nodes: get().nodes.map((n) => (n.selected !== ns.has(n.id) ? { ...n, selected: ns.has(n.id) } : n)),
        edges: get().edges.map((e) => (e.selected !== es.has(e.id) ? { ...e, selected: es.has(e.id) } : e)),
      });
    },

    groupSelection: () => {
      const ids = selectedIds();
      if (!ids.size) return;
      get().checkpoint();
      const { nodes } = groupNodes(get().nodes, ids);
      commitNodes(nodes);
    },

    ungroup: (id) => {
      const node = get().nodes.find((n) => n.id === id);
      if (!node || !getDefinition(node.data.type).accepts) return;
      get().checkpoint();
      const kids = get().nodes.filter((n) => n.parentId === id).map((n) => n.id);
      // Released members follow what their new group shows.
      commitNodes(refitCards(ungroupNode(get().nodes, id), kids).nodes);
    },

    toggleLock: (ids) => {
      if (!ids.length) return;
      get().checkpoint();
      const set_ = new Set(ids);
      const lock = !get().nodes.find((n) => set_.has(n.id))?.data.locked;
      set({
        nodes: get().nodes.map((n) => (set_.has(n.id) ? withLockFlags({ ...n, data: { ...n.data, locked: lock } }) : n)),
        dirty: true,
      });
    },

    setCompact: (id, on) => {
      const host = get().nodes.find((n) => n.id === id);
      if (!host) return;
      get().checkpoint();
      // Lines need far less width than cards: start compact hosts narrow (still resizable).
      const nodes = get().nodes.map((n) =>
        n.id === id ? { ...n, width: on ? COMPACT_WIDTH : n.width, measured: undefined, data: { ...n.data, props: { ...n.data.props, compact: on } } } : n,
      );
      // Grow what must grow, then let the surrounding zones hug the (smaller) host.
      commitNodes(shrinkAncestors(fitContainersToChildren(relayoutContainer(nodes, get().edges, id)), id));
      // An arranged group around it makes room for its new size.
      if (host.parentId) get().refreshCompact([host.parentId]);
    },

    refreshCompact: (ids) => {
      let nodes = get().nodes;
      const byId = indexById(nodes);
      const targets = new Map<string, number>();
      for (const id of ids) for (const m of managedAncestors(id, byId)) targets.set(m.id, depthOf(m, byId));
      if (!targets.size) return;
      // Innermost first: an arranged group places its members once they have their final size.
      const order = [...targets].sort((a, b) => b[1] - a[1]).map(([id]) => id);
      for (const r of order) nodes = fitContainersToChildren(relayoutContainer(nodes, get().edges, r, false));
      set({ nodes: sortByHierarchy(nodes) });
    },

    handleDragStop: (ids) => {
      let nodes = get().nodes;
      const touched = new Set<string>(ids.flatMap((id) => {
        const n = nodes.find((x) => x.id === id);
        return n?.parentId ? [n.parentId] : [];
      }));
      const idSet = new Set(ids);
      const roots = selectionRoots(nodes, idSet);
      let changed = false;
      for (const root of roots) {
        const byId = indexById(nodes);
        const current = byId.get(root.id)!;
        const abs = absolutePosition(current, byId);
        const size = nodeSize(current);
        const center = { x: abs.x + size.width / 2, y: abs.y + size.height / 2 };
        const excluded = new Set([current.id, ...descendantIds(current.id, nodes)]);
        const target = findContainerAt(center, nodes, current.data.type, excluded);
        if (target?.id !== current.parentId) {
          nodes = reparentNode(nodes, current.id, target?.id);
          const moved = nodes.find((n) => n.id === current.id)!;
          let inherited = inheritFromParent(moved, nodes);
          // A guest dragged out of a compact host gets its card back.
          const def = getDefinition(inherited.data.type);
          if (def.kind === 'device' && !inCompactHost(inherited, indexById(nodes)) && nodeSize(inherited).height <= COMPACT_ROW)
            inherited = { ...inherited, width: def.size.width, height: def.size.height, measured: undefined };
          nodes = nodes.map((n) => (n.id === moved.id ? inherited : n));
          // Cards follow what their new group shows.
          nodes = refitCards(nodes, [moved.id]).nodes;
          if (target) touched.add(target.id);
          changed = true;
        }
      }
      const fitted = fitContainersToChildren(nodes);
      if (changed || fitted.some((n, i) => n !== nodes[i])) commitNodes(fitted);
      // Lines of compact hosts follow the new order / membership.
      get().refreshCompact([...touched, ...ids]);
    },

    detachFromParent: (id) => {
      const node = get().nodes.find((n) => n.id === id);
      if (!node?.parentId) return;
      get().checkpoint();
      const parent = get().nodes.find((n) => n.id === node.parentId);
      let nodes = reparentNode(get().nodes, id, parent?.parentId);
      // Move it just outside the former parent.
      if (parent) {
        const byId = indexById(nodes);
        const pAbs = absolutePosition(parent, byId);
        const ps = nodeSize(parent);
        nodes = nodes.map((n) => {
          if (n.id !== id) return n;
          const grand = n.parentId ? absolutePosition(byId.get(n.parentId)!, byId) : { x: 0, y: 0 };
          return { ...n, position: { x: pAbs.x + ps.width + 40 - grand.x, y: pAbs.y - grand.y } };
        });
      }
      commitNodes(refitCards(nodes, [id]).nodes);
    },

    align: (mode) => {
      get().checkpoint();
      commitNodes(alignNodes(get().nodes, selectedIds(), mode));
    },
    distribute: (axis) => {
      get().checkpoint();
      commitNodes(distributeNodes(get().nodes, selectedIds(), axis));
    },

    applyLayout: (algorithm) => {
      get().checkpoint();
      commitNodes(autoLayout(get().nodes, get().edges, algorithm), { fitRequest: get().fitRequest + 1 });
    },

    bringToFront: (ids) => {
      const set_ = new Set(ids);
      const max = Math.max(0, ...get().nodes.map((n) => n.zIndex ?? 0));
      get().checkpoint();
      set({ nodes: get().nodes.map((n) => (set_.has(n.id) ? { ...n, zIndex: max + 1 } : n)), dirty: true });
    },
    sendToBack: (ids) => {
      const set_ = new Set(ids);
      get().checkpoint();
      set({ nodes: get().nodes.map((n) => (set_.has(n.id) ? withLayer({ ...n, zIndex: undefined }) : n)), dirty: true });
    },

    /* ------------------------------------------------------------ */
    /* Edges                                                         */
    /* ------------------------------------------------------------ */
    updateEdge: (id, patch) => {
      get().checkpoint(`edge:${id}:${Object.keys(patch).join(',')}`);
      set({
        edges: get().edges.map((e) => (e.id === id ? { ...e, data: { connType: 'ethernet', ...e.data, ...patch } } : e)),
        dirty: true,
      });
    },
    addParallelLink: (id) => {
      const { edges, nodes } = get();
      const base = edges.find((e) => e.id === id);
      const source = nodes.find((n) => n.id === base?.source);
      const target = nodes.find((n) => n.id === base?.target);
      if (!base || !source || !target) return;
      get().checkpoint();
      // An extra member of the same aggregate when the base link is bonded.
      const data = { ...inheritParallel(base, suggestConnection(source, target, edges, base.data?.connType)), bondId: base.data?.bondId };
      const edge: InfraEdge = { id: uid('e_'), type: 'network', source: base.source, target: base.target, data, selected: true };
      set({ edges: [...edges.map((e) => ({ ...e, selected: false })), edge], dirty: true });
    },
    createBond: (edgeIds, partial = {}) => {
      const { edges, nodes, bonds } = get();
      const members = edges.filter((e) => edgeIds.includes(e.id));
      if (!members.length) return null;
      get().checkpoint();
      const names = suggestBondNames(members, nodes, bonds);
      const bond: Bond = { id: uid('b_'), mode: 'lacp', ...names, ...partial };
      const ids = new Set(members.map((e) => e.id));
      const next = edges.map((e) => (ids.has(e.id) ? { ...e, data: { connType: 'ethernet' as const, ...e.data, bondId: bond.id } } : e));
      set({ edges: next, bonds: pruneBonds([...bonds, bond], next), dirty: true });
      return bond.id;
    },
    updateBond: (id, patch) => {
      get().checkpoint(`bond:${id}:${Object.keys(patch).join(',')}`);
      set({ bonds: get().bonds.map((b) => (b.id === id ? { ...b, ...patch, id } : b)), dirty: true });
    },
    addToBond: (bondId, edgeIds) => {
      if (!get().bonds.some((b) => b.id === bondId)) return;
      get().checkpoint();
      const ids = new Set(edgeIds);
      const next = get().edges.map((e) => (ids.has(e.id) ? { ...e, data: { connType: 'ethernet' as const, ...e.data, bondId } } : e));
      set({ edges: next, bonds: pruneBonds(get().bonds, next), dirty: true });
    },
    removeFromBond: (edgeIds) => {
      get().checkpoint();
      const ids = new Set(edgeIds);
      const next = get().edges.map((e) => (ids.has(e.id) && e.data ? { ...e, data: { ...e.data, bondId: undefined } } : e));
      set({ edges: next, bonds: pruneBonds(get().bonds, next), dirty: true });
    },
    deleteBond: (id) => {
      get().checkpoint();
      const next = get().edges.map((e) => (e.data?.bondId === id ? { ...e, data: { ...e.data, bondId: undefined } } : e));
      set({ edges: next, bonds: get().bonds.filter((b) => b.id !== id), dirty: true });
    },
    reverseEdge: (id) => {
      get().checkpoint();
      set({
        edges: get().edges.map((e) =>
          e.id === id
            ? {
                ...e,
                source: e.target,
                target: e.source,
                data: e.data && { ...e.data, sourcePort: e.data.targetPort, targetPort: e.data.sourcePort },
              }
            : e,
        ),
        dirty: true,
      });
    },
    setDefaultConnType: (defaultConnType) => set({ defaultConnType }),

    /* ------------------------------------------------------------ */
    /* VLANs                                                         */
    /* ------------------------------------------------------------ */
    addVlan: (partial = {}) => {
      const { vlans } = get();
      const used = new Set(vlans.map((v) => v.id));
      let id = partial.id ?? (vlans.length ? Math.max(...vlans.map((v) => v.id)) + 10 : 10);
      while (used.has(id)) id++;
      if (id > 4094) id = 2;
      const octet = Math.min(id, 254);
      const vlan: Vlan = {
        uid: uid('v_'),
        id,
        name: partial.name ?? `VLAN ${id}`,
        subnet: partial.subnet ?? `192.168.${octet}.0/24`,
        gateway: partial.gateway ?? `192.168.${octet}.1`,
        color: partial.color ?? VLAN_COLORS[vlans.length % VLAN_COLORS.length],
        description: partial.description ?? '',
      };
      get().checkpoint();
      set({ vlans: [...vlans, vlan].sort((a, b) => a.id - b.id), dirty: true });
      return vlan;
    },
    updateVlan: (vuid, patch) => {
      const old = get().vlans.find((v) => v.uid === vuid);
      if (!old) return;
      get().checkpoint(`vlan:${vuid}:${Object.keys(patch).join(',')}`);
      const vlans = get().vlans.map((v) => (v.uid === vuid ? { ...v, ...patch } : v));
      let { nodes, edges } = get();
      if (patch.id !== undefined && patch.id !== old.id) {
        const from = String(old.id);
        const to = String(patch.id);
        nodes = nodes.map((n) => remapNodeVlan(n, from, to));
        edges = edges.map((e) => {
          const list = (e.data?.vlan ?? '').split(',').map((s) => s.trim());
          if (!list.includes(from)) return e;
          return { ...e, data: { ...e.data!, vlan: list.map((x) => (x === from ? to : x)).join(',') } };
        });
      }
      set({ vlans, nodes, edges, dirty: true });
    },
    removeVlan: (vuid) => {
      const vlan = get().vlans.find((v) => v.uid === vuid);
      if (!vlan) return;
      get().checkpoint();
      const id = String(vlan.id);
      set({
        vlans: get().vlans.filter((v) => v.uid !== vuid),
        nodes: get().nodes.map((n) => remapNodeVlan(n, id, '')),
        edges: get().edges.map((e) => {
          const list = (e.data?.vlan ?? '').split(/[\s,]+/).filter(Boolean);
          return list.includes(id) ? { ...e, data: { ...e.data!, vlan: list.filter((x) => x !== id).join(',') } } : e;
        }),
        dirty: true,
      });
    },
    placeVlanZone: (vuid, at) => {
      const vlan = get().vlans.find((v) => v.uid === vuid);
      if (!vlan) return;
      const inst = flowApi.instance;
      const center =
        at ??
        inst?.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }) ?? { x: 0, y: 0 };
      const type = vlan.name.toLowerCase() === 'dmz' ? 'dmz' : 'vlan-zone';
      const id = get().addNode(type, center, { vlan: String(vlan.id) });
      get().updateNode(id, { name: vlan.name });
    },

    addCustomOs: (os) => {
      const customOs = [...get().customOs.filter((o) => o.id !== os.id), { ...os, custom: true }];
      setCustomOperatingSystems(customOs);
      set({ customOs, dirty: true });
    },
    removeCustomOs: (id) => {
      const customOs = get().customOs.filter((o) => o.id !== id);
      setCustomOperatingSystems(customOs);
      set({ customOs, dirty: true });
    },

    /* ------------------------------------------------------------ */
    /* Project                                                       */
    /* ------------------------------------------------------------ */
    loadContent: (c) => {
      setCustomOperatingSystems(c.customOs);
      lastCheckpoint = { key: '', time: 0 };
      set({
        metadata: c.metadata,
        nodes: sortByHierarchy(c.nodes.map(withLockFlags)),
        ...migrateLegacyBonds(c.edges, c.bonds ?? []),
        vlans: c.vlans,
        customOs: c.customOs,
        settings: c.settings,
        past: [],
        future: [],
        dirty: false,
        savedAt: c.metadata.updatedAt,
        fitRequest: get().fitRequest + 1,
      });
    },

    newProject: (templateId, name) => {
      const tpl = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[TEMPLATES.length - 1];
      const content = tpl.build();
      get().loadContent({
        metadata: newMetadata(name ?? (tpl.id === 'blank' ? 'Untitled project' : tpl.name)),
        nodes: content.nodes,
        edges: content.edges,
        vlans: content.vlans,
        bonds: content.bonds,
        customOs: [],
        settings: DEFAULT_SETTINGS,
      });
      get().save();
    },

    importFile: (raw) => {
      const content = fromProjectFile(raw);
      // Imports always become a new local project to avoid overwriting.
      content.metadata = { ...content.metadata, id: crypto.randomUUID() };
      get().loadContent(content);
      get().save();
    },

    exportFile: () => {
      const s = get();
      return toProjectFile({
        metadata: s.metadata,
        nodes: s.nodes,
        edges: s.edges,
        vlans: s.vlans,
        bonds: pruneBonds(s.bonds, s.edges),
        customOs: s.customOs,
        settings: s.settings,
        viewport: flowApi.instance?.getViewport(),
      });
    },

    save: (version = 'auto') => {
      const metadata = { ...get().metadata, updatedAt: now() };
      set({ metadata });
      saveProjectFile(get().exportFile(), version);
      set({ dirty: false, savedAt: metadata.updatedAt });
    },

    saveAs: (name) => {
      set({ metadata: { ...newMetadata(name), description: get().metadata.description } });
      get().save();
    },

    renameProject: (name) => {
      set({ metadata: { ...get().metadata, name }, dirty: true });
    },
    setDescription: (description) => set({ metadata: { ...get().metadata, description }, dirty: true }),
    setSettings: (patch) => set({ settings: { ...get().settings, ...patch }, dirty: true }),
  };
});
