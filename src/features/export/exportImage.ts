import { toPng, toSvg } from 'html-to-image';
import type { InfraNode } from '../../types';
import { downloadBlob, slugify } from '../../utils/misc';
import { flowApi } from '../canvas/flowApi';
import { descendantIds } from '../nodes/hierarchy';

export type ExportFormat = 'png' | 'svg' | 'pdf';
export type ExportResolution = 'standard' | 'high' | '4k';
export type ExportArea = 'all' | 'selection' | 'viewport';
export type ExportBackground = 'transparent' | 'white' | 'dark';

export interface ExportOptions {
  format: ExportFormat;
  resolution: ExportResolution;
  area: ExportArea;
  background: ExportBackground;
  padding: number;
  filename: string;
}

const MAX_SIDE = 16000;
const BACKGROUNDS: Record<ExportBackground, string | undefined> = {
  transparent: undefined,
  white: '#ffffff',
  dark: '#0b1120',
};

/** UI elements that must never appear in an export. */
const EXCLUDED_CLASSES = [
  'react-flow__handle',
  'react-flow__resize-control',
  'react-flow__minimap',
  'react-flow__controls',
  'react-flow__panel',
  'react-flow__nodesselection',
  'react-flow__selection',
  'helper-line',
  'no-export',
];

function pixelRatioFor(resolution: ExportResolution, width: number, height: number): number {
  const longest = Math.max(width, height);
  let ratio = resolution === 'standard' ? 1 : resolution === 'high' ? 2 : 3840 / longest;
  ratio = Math.max(ratio, 0.25);
  return Math.min(ratio, MAX_SIDE / longest);
}

interface Frame {
  width: number;
  height: number;
  transform: string;
  includeIds?: Set<string>;
  includeEdges?: Set<string>;
}

function computeFrame(opts: ExportOptions, flowEl: HTMLElement): Frame {
  const inst = flowApi.instance;
  if (!inst) throw new Error('Canvas not ready');
  if (opts.area === 'viewport') {
    const { x, y, zoom } = inst.getViewport();
    return { width: flowEl.clientWidth, height: flowEl.clientHeight, transform: `translate(${x}px, ${y}px) scale(${zoom})` };
  }
  const nodes = inst.getNodes() as InfraNode[];
  let picked = nodes;
  let includeIds: Set<string> | undefined;
  let includeEdges: Set<string> | undefined;
  if (opts.area === 'selection') {
    const ids = new Set<string>();
    for (const n of nodes) {
      if (!n.selected) continue;
      ids.add(n.id);
      for (const d of descendantIds(n.id, nodes)) ids.add(d);
    }
    if (!ids.size) throw new Error('Select at least one element to export a selection.');
    // Keep ancestors visible (but they do not extend the frame).
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const visible = new Set(ids);
    for (const id of ids) {
      let p = byId.get(id)?.parentId;
      while (p) {
        visible.add(p);
        p = byId.get(p)?.parentId;
      }
    }
    picked = nodes.filter((n) => ids.has(n.id));
    includeIds = visible;
    includeEdges = new Set(inst.getEdges().filter((e) => ids.has(e.source) && ids.has(e.target)).map((e) => e.id));
  }
  if (!picked.length) throw new Error('The diagram is empty.');
  const bounds = inst.getNodesBounds(picked);
  const pad = opts.padding;
  return {
    width: Math.ceil(bounds.width + pad * 2),
    height: Math.ceil(bounds.height + pad * 2),
    transform: `translate(${-bounds.x + pad}px, ${-bounds.y + pad}px) scale(1)`,
    includeIds,
    includeEdges,
  };
}

function makeFilter(frame: Frame) {
  return (el: HTMLElement | SVGElement): boolean => {
    const cls = el.classList;
    if (!cls) return true;
    for (const c of EXCLUDED_CLASSES) if (cls.contains(c)) return false;
    if (frame.includeIds && cls.contains('react-flow__node')) {
      return frame.includeIds.has(el.getAttribute('data-id') ?? '');
    }
    if (frame.includeEdges && cls.contains('react-flow__edge')) {
      return frame.includeEdges.has(el.getAttribute('data-id') ?? '');
    }
    if (frame.includeEdges && cls.contains('edge-label')) {
      return frame.includeEdges.has(el.getAttribute('data-edge-id') ?? '');
    }
    return true;
  };
}

async function dataUrlToBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  return res.blob();
}

/** Render the diagram (without any UI chrome) and download it. */
export async function exportDiagram(opts: ExportOptions): Promise<void> {
  const flowEl = document.querySelector<HTMLElement>('.react-flow');
  const viewport = document.querySelector<HTMLElement>('.react-flow__viewport');
  if (!flowEl || !viewport) throw new Error('Canvas not ready');
  const frame = computeFrame(opts, flowEl);

  // Force the requested theme on the exported subtree and hide selection styles.
  const themeClass = opts.background === 'dark' ? 'force-dark' : opts.background === 'white' ? 'force-light' : '';
  flowEl.classList.add('exporting');
  if (themeClass) flowEl.classList.add(themeClass);
  await new Promise((r) => requestAnimationFrame(() => r(null)));

  try {
    const common = {
      width: frame.width,
      height: frame.height,
      backgroundColor: BACKGROUNDS[opts.background],
      style: { width: `${frame.width}px`, height: `${frame.height}px`, transform: frame.transform },
      filter: makeFilter(frame),
    };
    const name = slugify(opts.filename);
    if (opts.format === 'svg') {
      const url = await toSvg(viewport, common);
      const svg = decodeURIComponent(url.replace(/^data:image\/svg\+xml;charset=utf-8,/, ''));
      downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${name}.svg`);
      return;
    }
    const pixelRatio = pixelRatioFor(opts.resolution, frame.width, frame.height);
    const png = await toPng(viewport, { ...common, pixelRatio });
    if (opts.format === 'png') {
      downloadBlob(await dataUrlToBlob(png), `${name}.png`);
      return;
    }
    const { jsPDF } = await import('jspdf');
    const orientation = frame.width >= frame.height ? 'landscape' : 'portrait';
    const pdf = new jsPDF({ orientation, unit: 'px', format: [frame.width, frame.height], hotfixes: ['px_scaling'] });
    pdf.addImage(png, 'PNG', 0, 0, frame.width, frame.height, undefined, 'FAST');
    pdf.setProperties({ title: opts.filename, creator: 'InfraCanvas' });
    pdf.save(`${name}.pdf`);
  } finally {
    flowEl.classList.remove('exporting');
    if (themeClass) flowEl.classList.remove(themeClass);
  }
}

export function estimateExportSize(opts: Pick<ExportOptions, 'area' | 'resolution' | 'padding'>): { width: number; height: number } | null {
  const flowEl = document.querySelector<HTMLElement>('.react-flow');
  if (!flowEl) return null;
  try {
    const frame = computeFrame({ ...opts, format: 'png', background: 'white', filename: '' }, flowEl);
    const r = pixelRatioFor(opts.resolution, frame.width, frame.height);
    return { width: Math.round(frame.width * r), height: Math.round(frame.height * r) };
  } catch {
    return null;
  }
}
