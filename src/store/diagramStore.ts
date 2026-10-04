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
import { suggestConnection } from '../features/connections/suggest';
import { autoLayout } from '../features/layout/autoLayout';
import { createNode, createNodeFromPreset, withLayer } from '../features/nodes/factory';
import {
  absolutePosition,
  descendantIds,
  findContainerAt,
  fitContainersToChildren,
  indexById,
  nodeSize,
  reparentNode,
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
import type {
  ConnectionType,
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
}

const HISTORY_LIMIT = 100;

export interface DiagramState {
  metadata: ProjectMetadata;
  nodes: InfraNode[];
  edges: InfraEdge[];
  vlans: Vlan[];
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
  handleDragStop: (ids: string[]) => void;
  detachFromParent: (id: string) => void;
  align: (mode: AlignMode) => void;
  distribute: (axis: 'horizontal' | 'vertical') => void;
  applyLayout: (algorithm: LayoutAlgorithm) => void;
  bringToFront: (ids: string[]) => void;
  sendToBack: (ids: string[]) => void;

  updateEdge: (id: string, patch: Partial<InfraEdgeData>) => void;
  reverseEdge: (id: string) => void;
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
  save: () => void;
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

function snapshot(s: Pick<DiagramState, 'nodes' | 'edges' | 'vlans'>): Snapshot {
  return {
    nodes: s.nodes.map((n) => ({ ...n, selected: false, dragging: false })),
    edges: s.edges.map((e) => ({ ...e, selected: false })),
    vlans: s.vlans,
  };
}

function withLockFlags(n: InfraNode): InfraNode {
  const locked = !!n.data.locked;
  return withLayer({ ...n, draggable: locked ? false : undefined, deletable: locked ? false : undefined });
}

let lastCheckpoint = { key: '', time: 0 };

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
      if (ip) props.ip = ip;
    }
    return { ...node, data: { ...node.data, props } };
  };

  return {
    metadata: newMetadata('Untitled project'),
    nodes: [],
    edges: [],
    vlans: [],
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
      if (edges.some((e) => (e.source === c.source && e.target === c.target) || (e.source === c.target && e.target === c.source))) {
        return;
      }
      const source = nodes.find((n) => n.id === c.source);
      const target = nodes.find((n) => n.id === c.target);
      if (!source || !target) return;
      get().checkpoint();
      const data = suggestConnection(source, target, edges, defaultConnType === 'auto' ? undefined : defaultConnType);
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
        position = { x: Math.max(16, position.x - pAbs.x), y: Math.max(56, position.y - pAbs.y) };
      }
      let node = createNodeFromPreset(preset, {
        position,
        parentId: parent?.id,
        existingNames: nodes.map((n) => n.data.name),
      });
      node = inheritFromParent(node, nodes);
      node.selected = true;
      const next = fitContainersToChildren([...nodes.map((n) => ({ ...n, selected: false })), node]);
      commitNodes(next, { edges: get().edges.map((e) => ({ ...e, selected: false })) });
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
      let y = 60;
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
      node = inheritFromParent(node, nodes);
      node.selected = true;
      commitNodes(fitContainersToChildren([...nodes.map((n) => ({ ...n, selected: false })), node]));
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
      set({
        nodes: get().nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, props: { ...n.data.props, ...patch } } } : n)),
        dirty: true,
      });
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
      set({
        nodes: nodes.filter((n) => !toRemove.has(n.id)),
        edges: edges.filter((e) => !edgeSet.has(e.id) && !toRemove.has(e.source) && !toRemove.has(e.target)),
        dirty: true,
      });
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
      set({ nodes: result.nodes, edges: result.edges, dirty: true });
    },

    duplicateSelection: () => {
      const clip = copyToClipboard(get().nodes, get().edges, selectedIds());
      if (!clip) return;
      get().checkpoint();
      const result = pasteClipboard(get().nodes, get().edges, clip, { offset: { x: 32, y: 32 }, keepParent: true });
      commitNodes(fitContainersToChildren(result.nodes), { edges: result.edges });
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
      commitNodes(ungroupNode(get().nodes, id));
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

    handleDragStop: (ids) => {
      let nodes = get().nodes;
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
          const inherited = inheritFromParent(moved, nodes);
          nodes = nodes.map((n) => (n.id === moved.id ? inherited : n));
          changed = true;
        }
      }
      const fitted = fitContainersToChildren(nodes);
      if (changed || fitted.some((n, i) => n !== nodes[i])) commitNodes(fitted);
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
      commitNodes(nodes);
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
        nodes = nodes.map((n) => (str(n.data.props.vlan) === from ? { ...n, data: { ...n.data, props: { ...n.data.props, vlan: to } } } : n));
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
        nodes: get().nodes.map((n) => (str(n.data.props.vlan) === id ? { ...n, data: { ...n.data, props: { ...n.data.props, vlan: '' } } } : n)),
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
        edges: c.edges,
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
        customOs: s.customOs,
        settings: s.settings,
        viewport: flowApi.instance?.getViewport(),
      });
    },

    save: () => {
      const metadata = { ...get().metadata, updatedAt: now() };
      set({ metadata });
      saveProjectFile(get().exportFile());
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
