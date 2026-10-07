import type { ProjectFile } from '../../types';

/**
 * Local persistence.
 *
 * Projects live in IndexedDB (no 5 MB limit, not blocking the page). The
 * whole list is mirrored in memory at start-up so the rest of the app reads
 * synchronously; writes go to the database in the background, in order.
 * When IndexedDB is unavailable (private mode of some browsers…), projects
 * fall back to localStorage, without version history.
 *
 * Database "infracanvas":
 *   projects  id → ProjectFile
 *   summaries id → ProjectSummary
 *   versions  auto id → ProjectVersion (index projectId)
 */
const DB_NAME = 'infracanvas';
const DB_VERSION = 1;
const LEGACY_INDEX_KEY = 'infracanvas.projects';
const LEGACY_PROJECT_KEY = (id: string) => `infracanvas.project.${id}`;
/** Automatic versions are taken at most this often while editing. */
const AUTO_VERSION_INTERVAL = 10 * 60 * 1000;
/** Versions kept per project (named versions are never pruned). */
const MAX_VERSIONS = 40;

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

export interface ProjectVersion {
  id?: number;
  projectId: string;
  savedAt: string;
  /** Name given by the user ("Before migration"); automatic versions have none. */
  label?: string;
  kind: 'auto' | 'manual' | 'restore';
  nodeCount: number;
  edgeCount: number;
  file: ProjectFile;
}

export type VersionSummary = Omit<ProjectVersion, 'file'> & { id: number };

export type StorageBackend = 'indexeddb' | 'localstorage';

export class StorageQuotaError extends Error {}

const summaries = new Map<string, ProjectSummary>();
const files = new Map<string, ProjectFile>();
let db: IDBDatabase | null = null;
let backend: StorageBackend = 'localstorage';
let queue: Promise<unknown> = Promise.resolve();
const errorListeners = new Set<(e: Error) => void>();

export const storageBackend = () => backend;
export const historyAvailable = () => backend === 'indexeddb';

/** Background write failures (storage full…). */
export function onStorageError(fn: (e: Error) => void): () => void {
  errorListeners.add(fn);
  return () => errorListeners.delete(fn);
}

function report(e: unknown) {
  const quota = e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED');
  const err = quota ? new StorageQuotaError('Storage is full') : e instanceof Error ? e : new Error(String(e));
  for (const fn of errorListeners) fn(err);
}

// --- IndexedDB helpers ----------------------------------------------------

const done = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const finished = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects');
      if (!d.objectStoreNames.contains('summaries')) d.createObjectStore('summaries');
      if (!d.objectStoreNames.contains('versions')) d.createObjectStore('versions', { keyPath: 'id', autoIncrement: true }).createIndex('projectId', 'projectId');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Database blocked'));
  });
}

/** Run writes one after the other, so that the last save always wins. */
function enqueue(work: () => Promise<unknown>): Promise<void> {
  const next = queue.then(work).catch(report);
  queue = next;
  return next.then(() => undefined);
}

/** Resolves when every pending write has reached the database. */
export const flushStorage = () => queue.then(() => undefined);

// --- localStorage (fallback and legacy) ------------------------------------

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function legacyProjects(): { list: ProjectSummary[]; files: ProjectFile[] } {
  const list = readJson<ProjectSummary[]>(LEGACY_INDEX_KEY) ?? [];
  return { list, files: list.map((s) => readJson<ProjectFile>(LEGACY_PROJECT_KEY(s.id))).filter((f): f is ProjectFile => !!f) };
}

/**
 * Load every project in memory. Called once before the app renders; moves
 * projects saved by older versions (localStorage) into IndexedDB.
 */
export async function initStorage(): Promise<StorageBackend> {
  summaries.clear();
  files.clear();
  try {
    if (typeof indexedDB === 'undefined') throw new Error('No IndexedDB');
    db = await openDb();
    const tx = db.transaction(['projects', 'summaries'], 'readonly');
    const [list, all] = await Promise.all([done(tx.objectStore('summaries').getAll()), done(tx.objectStore('projects').getAll())]);
    for (const s of list as ProjectSummary[]) summaries.set(s.id, s);
    for (const f of all as ProjectFile[]) files.set(f.metadata.id, f);
    backend = 'indexeddb';
    // Migration from localStorage (InfraCanvas ≤ 1.8).
    const legacy = legacyProjects();
    if (legacy.files.length) {
      const wtx = db.transaction(['projects', 'summaries'], 'readwrite');
      for (const f of legacy.files) {
        if (files.has(f.metadata.id)) continue;
        const s = legacy.list.find((x) => x.id === f.metadata.id) ?? summarize(f);
        files.set(f.metadata.id, f);
        summaries.set(s.id, s);
        wtx.objectStore('projects').put(f, f.metadata.id);
        wtx.objectStore('summaries').put(s, s.id);
      }
      await finished(wtx);
      for (const s of legacy.list) localStorage.removeItem(LEGACY_PROJECT_KEY(s.id));
      localStorage.removeItem(LEGACY_INDEX_KEY);
    }
  } catch {
    db = null;
    backend = 'localstorage';
    const legacy = legacyProjects();
    for (const s of legacy.list) summaries.set(s.id, s);
    for (const f of legacy.files) files.set(f.metadata.id, f);
  }
  return backend;
}

// --- Projects ----------------------------------------------------------------

export function listProjects(): ProjectSummary[] {
  return [...summaries.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function loadProjectFile(id: string): ProjectFile | null {
  return files.get(id) ?? null;
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

const countNodes = (file: ProjectFile) => file.nodes.length + file.networks.length + file.groups.length + file.annotations.length;

function summarize(file: ProjectFile): ProjectSummary {
  const preview = buildPreview(file);
  return {
    id: file.metadata.id,
    name: file.metadata.name,
    description: file.metadata.description,
    createdAt: file.metadata.createdAt,
    updatedAt: file.metadata.updatedAt,
    nodeCount: countNodes(file),
    edgeCount: file.connections.length,
    preview: preview.boxes,
    previewLinks: preview.links,
  };
}

/** Last version time per project (to space automatic versions). */
const lastVersionAt = new Map<string, number>();

/**
 * Save a project. `version` records it in the history: "manual" for an
 * explicit save, "auto" for autosaves (at most every few minutes).
 */
export function saveProjectFile(file: ProjectFile, version: 'auto' | 'manual' | 'none' = 'auto'): void {
  const summary = summarize(file);
  const id = file.metadata.id;
  if (backend === 'localstorage') {
    try {
      localStorage.setItem(LEGACY_PROJECT_KEY(id), JSON.stringify(file));
      const list = listProjects().filter((p) => p.id !== id);
      localStorage.setItem(LEGACY_INDEX_KEY, JSON.stringify([summary, ...list]));
    } catch (e) {
      throw new StorageQuotaError(e instanceof Error ? e.message : 'Storage is full');
    }
    files.set(id, file);
    summaries.set(id, summary);
    return;
  }
  files.set(id, file);
  summaries.set(id, summary);
  const now = Date.now();
  const takeVersion = version === 'manual' || (version === 'auto' && now - (lastVersionAt.get(id) ?? 0) > AUTO_VERSION_INTERVAL);
  if (takeVersion) lastVersionAt.set(id, now);
  void enqueue(async () => {
    const tx = db!.transaction(['projects', 'summaries', 'versions'], 'readwrite');
    tx.objectStore('projects').put(file, id);
    tx.objectStore('summaries').put(summary, id);
    if (takeVersion) tx.objectStore('versions').add(versionOf(file, version === 'manual' ? 'manual' : 'auto'));
    await finished(tx);
    if (takeVersion) await pruneVersions(id);
  });
}

export function deleteProject(id: string): void {
  files.delete(id);
  summaries.delete(id);
  if (backend === 'localstorage') {
    localStorage.removeItem(LEGACY_PROJECT_KEY(id));
    localStorage.setItem(LEGACY_INDEX_KEY, JSON.stringify(listProjects()));
    return;
  }
  void enqueue(async () => {
    const tx = db!.transaction(['projects', 'summaries', 'versions'], 'readwrite');
    tx.objectStore('projects').delete(id);
    tx.objectStore('summaries').delete(id);
    const keys = await done(tx.objectStore('versions').index('projectId').getAllKeys(id));
    for (const k of keys) tx.objectStore('versions').delete(k);
    await finished(tx);
  });
}

// --- Version history ---------------------------------------------------------

function versionOf(file: ProjectFile, kind: ProjectVersion['kind'], label?: string): ProjectVersion {
  return { projectId: file.metadata.id, savedAt: new Date().toISOString(), kind, label, nodeCount: countNodes(file), edgeCount: file.connections.length, file };
}

async function pruneVersions(projectId: string): Promise<void> {
  const list = await readVersions(projectId);
  const removable = list.filter((v) => !v.label).slice(MAX_VERSIONS);
  if (!removable.length) return;
  const tx = db!.transaction('versions', 'readwrite');
  for (const v of removable) tx.objectStore('versions').delete(v.id);
  await finished(tx);
}

/** Versions of a project, newest first (without their content). */
export async function listVersions(projectId: string): Promise<VersionSummary[]> {
  if (!db) return [];
  await flushStorage();
  return readVersions(projectId);
}

/** Read without waiting for pending writes (used from inside the write queue). */
async function readVersions(projectId: string): Promise<VersionSummary[]> {
  const tx = db!.transaction('versions', 'readonly');
  const all = (await done(tx.objectStore('versions').index('projectId').getAll(projectId))) as (ProjectVersion & { id: number })[];
  return all.map(({ file: _file, ...rest }) => rest).sort((a, b) => b.savedAt.localeCompare(a.savedAt) || b.id - a.id);
}

export async function loadVersion(id: number): Promise<ProjectFile | null> {
  if (!db) return null;
  const tx = db.transaction('versions', 'readonly');
  const v = (await done(tx.objectStore('versions').get(id))) as ProjectVersion | undefined;
  return v?.file ?? null;
}

/** Record the given state as a named version. */
export function addVersion(file: ProjectFile, kind: ProjectVersion['kind'], label?: string): Promise<void> {
  if (!db) return Promise.resolve();
  return enqueue(async () => {
    const tx = db!.transaction('versions', 'readwrite');
    tx.objectStore('versions').add(versionOf(file, kind, label));
    await finished(tx);
  });
}

export function renameVersion(id: number, label: string): Promise<void> {
  if (!db) return Promise.resolve();
  return enqueue(async () => {
    const tx = db!.transaction('versions', 'readwrite');
    const store = tx.objectStore('versions');
    const v = (await done(store.get(id))) as ProjectVersion | undefined;
    if (v) store.put({ ...v, label: label.trim() || undefined });
    await finished(tx);
  });
}

export function deleteVersion(id: number): Promise<void> {
  if (!db) return Promise.resolve();
  return enqueue(async () => {
    const tx = db!.transaction('versions', 'readwrite');
    tx.objectStore('versions').delete(id);
    await finished(tx);
  });
}
