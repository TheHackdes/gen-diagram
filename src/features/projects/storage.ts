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
  /** Rough preview: top-level rectangles normalized to 0..1. */
  preview: { x: number; y: number; w: number; h: number; c?: string }[];
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

function buildPreview(file: ProjectFile): ProjectSummary['preview'] {
  const all = [...file.nodes, ...file.networks, ...file.groups];
  const top = all.filter((n) => !n.parentId);
  if (!top.length) return [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of top) {
    const w = n.width ?? 200;
    const h = n.height ?? 64;
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + w);
    maxY = Math.max(maxY, n.position.y + h);
  }
  const span = Math.max(maxX - minX, maxY - minY, 1);
  return top.slice(0, 80).map((n) => ({
    x: (n.position.x - minX) / span,
    y: (n.position.y - minY) / span,
    w: (n.width ?? 200) / span,
    h: (n.height ?? 64) / span,
    c: n.data.type,
  }));
}

export class StorageQuotaError extends Error {}

export function saveProjectFile(file: ProjectFile): void {
  const summary: ProjectSummary = {
    id: file.metadata.id,
    name: file.metadata.name,
    description: file.metadata.description,
    createdAt: file.metadata.createdAt,
    updatedAt: file.metadata.updatedAt,
    nodeCount: file.nodes.length + file.networks.length + file.groups.length + file.annotations.length,
    edgeCount: file.connections.length,
    preview: buildPreview(file),
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
