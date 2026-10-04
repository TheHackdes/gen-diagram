import type { ProjectFile } from '../../types';

/**
 * Local persistence (browser localStorage).
 * Index:   infracanvas.projects           → ProjectSummary[]
 * Content: infracanvas.project.<id>       → ProjectFile
 */
const INDEX_KEY = 'infracanvas.projects';
const PROJECT_KEY = (id: string) => `infracanvas.project.${id}`;

export interface ProjectSummary {
  id: string;
  name: string;
  description?: string;
  updatedAt: string;
  createdAt: string;
  nodeCount: number;
  edgeCount: number;
  /** Rough preview: rectangles normalized to 0..1. */
  preview: { x: number; y: number; w: number; h: number; c?: string }[];
  /** Links between box centres [x1, y1, x2, y2] (absent in older summaries). */
  previewLinks?: number[][];
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function listProjects(): ProjectSummary[] {
  const list = readJson<ProjectSummary[]>(INDEX_KEY) ?? [];
  return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function loadProjectFile(id: string): ProjectFile | null {
  return readJson<ProjectFile>(PROJECT_KEY(id));
}

function buildPreview(file: ProjectFile): { boxes: ProjectSummary['preview']; links: number[][] } {
  const all = [...file.nodes, ...file.networks, ...file.groups];
  if (!all.length) return { boxes: [], links: [] };
  const byId = new Map(all.map((n) => [n.id, n]));
  // Absolute positions: children are stored relative to their parent.
  const abs = (id: string): { x: number; y: number } => {
    const n = byId.get(id)!;
    const p = n.parentId && byId.has(n.parentId) ? abs(n.parentId) : { x: 0, y: 0 };
    return { x: p.x + n.position.x, y: p.y + n.position.y };
  };
  const depth = (id: string): number => {
    const n = byId.get(id)!;
    return n.parentId && byId.has(n.parentId) ? 1 + depth(n.parentId) : 0;
  };
  // Containers first so that their contents are drawn on top.
  const boxes = all
    .map((n) => ({ n, p: abs(n.id), w: n.width ?? 200, h: n.height ?? 64, d: depth(n.id) }))
    .sort((a, b) => a.d - b.d);
  const minX = Math.min(...boxes.map((b) => b.p.x));
  const minY = Math.min(...boxes.map((b) => b.p.y));
  const maxX = Math.max(...boxes.map((b) => b.p.x + b.w));
  const maxY = Math.max(...boxes.map((b) => b.p.y + b.h));
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const centre = new Map(boxes.map((b) => [b.n.id, [(b.p.x + b.w / 2 - minX) / span, (b.p.y + b.h / 2 - minY) / span]]));
  return {
    boxes: boxes.slice(0, 160).map((b) => ({ x: (b.p.x - minX) / span, y: (b.p.y - minY) / span, w: b.w / span, h: b.h / span, c: b.n.data.type })),
    links: file.connections
      .slice(0, 160)
      .flatMap((e) => (centre.has(e.source) && centre.has(e.target) ? [[...centre.get(e.source)!, ...centre.get(e.target)!].map((v) => +v.toFixed(4))] : [])),
  };
}

export class StorageQuotaError extends Error {}

export function saveProjectFile(file: ProjectFile): void {
  const preview = buildPreview(file);
  const summary: ProjectSummary = {
    id: file.metadata.id,
    name: file.metadata.name,
    description: file.metadata.description,
    createdAt: file.metadata.createdAt,
    updatedAt: file.metadata.updatedAt,
    nodeCount: file.nodes.length + file.networks.length + file.groups.length + file.annotations.length,
    edgeCount: file.connections.length,
    preview: preview.boxes,
    previewLinks: preview.links,
  };
  try {
    localStorage.setItem(PROJECT_KEY(file.metadata.id), JSON.stringify(file));
    const list = listProjects().filter((p) => p.id !== summary.id);
    localStorage.setItem(INDEX_KEY, JSON.stringify([summary, ...list]));
  } catch (e) {
    throw new StorageQuotaError(e instanceof Error ? e.message : 'Storage is full');
  }
}

export function deleteProject(id: string): void {
  localStorage.removeItem(PROJECT_KEY(id));
  localStorage.setItem(INDEX_KEY, JSON.stringify(listProjects().filter((p) => p.id !== id)));
}
