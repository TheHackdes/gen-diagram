import type { Viewport } from '@xyflow/react';
import { getDefinition, hasDefinition } from '../../data/catalog';
import type {
  Bond,
  InfraEdge,
  InfraNode,
  OperatingSystem,
  ProjectFile,
  ProjectMetadata,
  ProjectSettings,
  Vlan,
} from '../../types';
import { sortByHierarchy } from '../nodes/hierarchy';

export const DEFAULT_SETTINGS: ProjectSettings = {
  snapToGrid: true,
  showGrid: true,
  showEdgeLabels: true,
  showPortLabels: true,
  showMinimap: false,
};

export interface DiagramContent {
  metadata: ProjectMetadata;
  nodes: InfraNode[];
  edges: InfraEdge[];
  vlans: Vlan[];
  bonds?: Bond[];
  customOs: OperatingSystem[];
  settings: ProjectSettings;
  viewport?: Viewport;
}

/** Strip transient React Flow state before persisting. */
function cleanNode(n: InfraNode): InfraNode {
  const out: InfraNode = {
    id: n.id,
    type: n.type,
    position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
    data: n.data,
  };
  if (n.parentId) out.parentId = n.parentId;
  if (n.width) out.width = Math.round(n.width);
  if (n.height) out.height = Math.round(n.height);
  if (n.zIndex !== undefined) out.zIndex = n.zIndex;
  if (n.data.locked) {
    out.draggable = false;
    out.deletable = false;
  }
  return out;
}

function cleanEdge(e: InfraEdge): InfraEdge {
  return { id: e.id, type: 'network', source: e.source, target: e.target, data: e.data };
}

export function toProjectFile(c: DiagramContent): ProjectFile {
  const nodes = c.nodes.map(cleanNode);
  const pick = (pred: (n: InfraNode) => boolean) => nodes.filter(pred);
  const kind = (n: InfraNode) => getDefinition(n.data.type);
  return {
    format: 'infracanvas',
    version: 1,
    metadata: c.metadata,
    nodes: pick((n) => kind(n).kind === 'device' || kind(n).kind === 'container'),
    networks: pick((n) => kind(n).kind === 'zone' && n.data.type !== 'group'),
    groups: pick((n) => n.data.type === 'group'),
    annotations: pick((n) => kind(n).kind === 'annotation'),
    connections: c.edges.map(cleanEdge),
    vlans: c.vlans,
    bonds: c.bonds ?? [],
    customOperatingSystems: c.customOs,
    settings: c.settings,
    viewport: c.viewport,
  };
}

export class ProjectFormatError extends Error {}

export function fromProjectFile(raw: unknown): DiagramContent {
  if (!raw || typeof raw !== 'object') throw new ProjectFormatError('The file is not a valid JSON object.');
  const f = raw as Partial<ProjectFile>;
  if (f.format !== 'infracanvas') throw new ProjectFormatError('This is not an InfraCanvas project file.');
  if (f.version !== 1) throw new ProjectFormatError(`Unsupported project version: ${String(f.version)}`);
  const all = [...(f.nodes ?? []), ...(f.networks ?? []), ...(f.groups ?? []), ...(f.annotations ?? [])];
  const ids = new Set<string>();
  const nodes: InfraNode[] = [];
  for (const n of all) {
    if (!n?.id || !n.data || typeof n.data.type !== 'string' || ids.has(n.id)) continue;
    if (!hasDefinition(n.data.type)) continue;
    ids.add(n.id);
    const def = getDefinition(n.data.type);
    nodes.push({
      ...n,
      type: def.renderer,
      position: { x: Number(n.position?.x) || 0, y: Number(n.position?.y) || 0 },
      data: { ...n.data, name: String(n.data.name ?? def.label), props: { ...(n.data.props ?? {}) } },
    });
  }
  // Drop dangling parents.
  for (const n of nodes) if (n.parentId && !ids.has(n.parentId)) delete n.parentId;
  const edges = (f.connections ?? [])
    .filter((e) => e && ids.has(e.source) && ids.has(e.target))
    .map((e) => ({ ...e, type: 'network' as const, data: { connType: 'ethernet' as const, ...(e.data ?? {}) } }));
  const now = new Date().toISOString();
  return {
    metadata: {
      id: f.metadata?.id ?? crypto.randomUUID(),
      name: f.metadata?.name ?? 'Imported project',
      description: f.metadata?.description,
      author: f.metadata?.author,
      createdAt: f.metadata?.createdAt ?? now,
      updatedAt: f.metadata?.updatedAt ?? now,
    },
    nodes: sortByHierarchy(nodes),
    edges,
    vlans: Array.isArray(f.vlans) ? f.vlans : [],
    bonds: Array.isArray(f.bonds) ? f.bonds.filter((b) => b && typeof b.id === 'string') : [],
    customOs: Array.isArray(f.customOperatingSystems) ? f.customOperatingSystems : [],
    settings: { ...DEFAULT_SETTINGS, ...(f.settings ?? {}) },
    viewport: f.viewport,
  };
}
