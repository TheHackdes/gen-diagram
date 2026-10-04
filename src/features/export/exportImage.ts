import { toPng, toSvg } from 'html-to-image';
import { useDiagram } from '../../store/diagramStore';
import type { InfraNode } from '../../types';
import { downloadBlob, slugify, uid } from '../../utils/misc';
import { flowApi } from '../canvas/flowApi';
import { hasRules, rulesOf } from '../firewall/rules';
import { createNode } from '../nodes/factory';
import { descendantIds } from '../nodes/hierarchy';

export type ExportFormat = 'png' | 'svg' | 'pdf';
export type ExportResolution = 'standard' | 'high' | '4k';
export type ExportArea = 'all' | 'selection' | 'viewport';
/** Colours of the drawing itself (cards, text, zones). */
export type ExportTheme = 'light' | 'dark';
/** What is behind the drawing. */
export type ExportBackground = 'transparent' | 'theme' | 'custom';
/** Which part of the diagram goes into the image(s). */
export type ExportContent = 'all' | 'infrastructure' | 'rules' | 'separate';

export interface ExportOptions {
  format: ExportFormat;
  resolution: ExportResolution;
  area: ExportArea;
  theme: ExportTheme;
  background: ExportBackground;
  /** Used when background is "custom". */
  backgroundColor?: string;
  content: ExportContent;
  padding: number;
  filename: string;
}

const MAX_SIDE = 16000;
const THEME_BACKGROUND: Record<ExportTheme, string> = { light: '#ffffff', dark: '#0b1120' };

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

const isRulesTable = (n: InfraNode) => n.data.type === 'fw-table';

/** Does the diagram contain at least one firewall rule? */
export function diagramHasRules(nodes: InfraNode[]): boolean {
  return nodes.some((n) => hasRules(n) && rulesOf(n.data.props).length > 0);
}

export function backgroundOf(opts: Pick<ExportOptions, 'theme' | 'background' | 'backgroundColor'>): string | undefined {
  if (opts.background === 'transparent') return undefined;
  if (opts.background === 'custom') return opts.backgroundColor || THEME_BACKGROUND[opts.theme];
  return THEME_BACKGROUND[opts.theme];
}

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

type Part = 'all' | 'infrastructure' | 'rules';

/** Visible ids for a set of nodes: the nodes, their contents and their containers. */
function withFamily(ids: Set<string>, nodes: InfraNode[]): Set<string> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out = new Set(ids);
  for (const id of ids) {
    for (const d of descendantIds(id, nodes)) out.add(d);
    let p = byId.get(id)?.parentId;
    while (p) {
      out.add(p);
      p = byId.get(p)?.parentId;
    }
  }
  return out;
}

function computeFrame(opts: ExportOptions, part: Part, flowEl: HTMLElement): Frame {
  const inst = flowApi.instance;
  if (!inst) throw new Error('Canvas not ready');
  const nodes = inst.getNodes() as InfraNode[];
  const edges = inst.getEdges();
  if (opts.area === 'viewport') {
    const { x, y, zoom } = inst.getViewport();
    return { width: flowEl.clientWidth, height: flowEl.clientHeight, transform: `translate(${x}px, ${y}px) scale(${zoom})` };
  }
  let base = nodes;
  if (opts.area === 'selection') {
    const ids = new Set<string>();
    for (const n of nodes) if (n.selected) [n.id, ...descendantIds(n.id, nodes)].forEach((id) => ids.add(id));
    if (!ids.size) throw new Error('Select at least one element to export a selection.');
    base = nodes.filter((n) => ids.has(n.id));
  }
  const picked = part === 'all' ? base : base.filter((n) => (part === 'rules' ? isRulesTable(n) : !isRulesTable(n)));
  if (!picked.length) throw new Error(part === 'rules' ? 'There is no firewall rule to export.' : 'Nothing to export.');
  const filtered = part !== 'all' || opts.area === 'selection';
  const ids = new Set(picked.map((n) => n.id));
  const bounds = inst.getNodesBounds(picked);
  const pad = opts.padding;
  return {
    width: Math.ceil(bounds.width + pad * 2),
    height: Math.ceil(bounds.height + pad * 2),
    transform: `translate(${-bounds.x + pad}px, ${-bounds.y + pad}px) scale(1)`,
    includeIds: filtered ? withFamily(ids, nodes) : undefined,
    includeEdges: filtered ? new Set(part === 'rules' ? [] : edges.filter((e) => ids.has(e.source) && ids.has(e.target)).map((e) => e.id)) : undefined,
  };
}

function makeFilter(frame: Frame) {
  return (el: HTMLElement | SVGElement): boolean => {
    const cls = el.classList;
    if (!cls) return true;
    for (const c of EXCLUDED_CLASSES) if (cls.contains(c)) return false;
    if (frame.includeIds && cls.contains('react-flow__node')) return frame.includeIds.has(el.getAttribute('data-id') ?? '');
    if (frame.includeEdges && cls.contains('react-flow__edge')) return frame.includeEdges.has(el.getAttribute('data-id') ?? '');
    if (frame.includeEdges && cls.contains('edge-label')) return frame.includeEdges.has(el.getAttribute('data-edge-id') ?? '');
    return true;
  };
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

/**
 * Exports of the firewall rules need a rules table on the canvas. When the
 * diagram has none, a temporary one is drawn (outside the undo history) and
 * removed afterwards.
 */
async function ensureRulesTable(): Promise<() => void> {
  const st = useDiagram.getState();
  if (st.nodes.some((n) => isRulesTable(n) && !n.parentId)) return () => undefined;
  const table = createNode('fw-table', { position: { x: 0, y: 0 }, props: { text: 'Firewall rules', scope: 'all' } });
  table.id = uid('tmp_');
  const { dirty } = st;
  useDiagram.setState({ nodes: [...st.nodes, table] });
  // Let it render, get measured and docked on the right.
  for (let i = 0; i < 4; i++) await nextFrame();
  return () => useDiagram.setState({ nodes: useDiagram.getState().nodes.filter((n) => n.id !== table.id), dirty });
}

interface Rendered {
  frame: Frame;
  png?: string;
  svg?: string;
}

async function render(opts: ExportOptions, part: Part, viewport: HTMLElement, flowEl: HTMLElement): Promise<Rendered> {
  const frame = computeFrame(opts, part, flowEl);
  const common = {
    width: frame.width,
    height: frame.height,
    backgroundColor: backgroundOf(opts),
    style: { width: `${frame.width}px`, height: `${frame.height}px`, transform: frame.transform },
    filter: makeFilter(frame),
  };
  if (opts.format === 'svg') return { frame, svg: await toSvg(viewport, common) };
  return { frame, png: await toPng(viewport, { ...common, pixelRatio: pixelRatioFor(opts.resolution, frame.width, frame.height) }) };
}

async function dataUrlToBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob();
}

/** Render the diagram (without any UI chrome) and download it. */
export async function exportDiagram(opts: ExportOptions): Promise<void> {
  const flowEl = document.querySelector<HTMLElement>('.react-flow');
  const viewport = document.querySelector<HTMLElement>('.react-flow__viewport');
  if (!flowEl || !viewport) throw new Error('Canvas not ready');
  const content: ExportContent = opts.area === 'viewport' ? 'all' : opts.content;
  const hasRuleData = diagramHasRules(useDiagram.getState().nodes);
  if ((content === 'rules' || content === 'separate') && !hasRuleData) throw new Error('The diagram has no firewall rule yet.');

  // "Both" and rules exports show the rules even if no table is drawn on the diagram.
  const cleanup = content !== 'infrastructure' && hasRuleData && opts.area === 'all' ? await ensureRulesTable() : () => undefined;
  // Force the chosen theme on the exported subtree and hide selection styles.
  const themeClass = opts.theme === 'dark' ? 'force-dark' : 'force-light';
  flowEl.classList.add('exporting', themeClass);
  await nextFrame();

  try {
    const parts: { part: Part; suffix: string }[] =
      content === 'separate'
        ? [
            { part: 'infrastructure', suffix: '-infrastructure' },
            { part: 'rules', suffix: '-firewall-rules' },
          ]
        : [{ part: content, suffix: content === 'rules' ? '-firewall-rules' : '' }];
    const images = [];
    for (const p of parts) images.push({ ...p, ...(await render(opts, p.part, viewport, flowEl)) });
    const name = slugify(opts.filename);

    if (opts.format === 'pdf') {
      // One PDF; separate parts become separate pages.
      const { jsPDF } = await import('jspdf');
      const first = images[0].frame;
      const pdf = new jsPDF({ orientation: first.width >= first.height ? 'landscape' : 'portrait', unit: 'px', format: [first.width, first.height], hotfixes: ['px_scaling'] });
      images.forEach((img, i) => {
        if (i > 0) pdf.addPage([img.frame.width, img.frame.height], img.frame.width >= img.frame.height ? 'landscape' : 'portrait');
        pdf.addImage(img.png!, 'PNG', 0, 0, img.frame.width, img.frame.height, undefined, 'FAST');
      });
      pdf.setProperties({ title: opts.filename, creator: 'InfraCanvas' });
      pdf.save(`${name}${content === 'rules' ? '-firewall-rules' : ''}.pdf`);
      return;
    }
    for (const img of images) {
      if (opts.format === 'svg') {
        const svg = decodeURIComponent(img.svg!.replace(/^data:image\/svg\+xml;charset=utf-8,/, ''));
        downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${name}${img.suffix}.svg`);
      } else {
        downloadBlob(await dataUrlToBlob(img.png!), `${name}${img.suffix}.png`);
      }
      // Browsers may drop a second download fired in the same tick.
      if (images.length > 1) await new Promise((r) => setTimeout(r, 400));
    }
  } finally {
    flowEl.classList.remove('exporting', themeClass);
    cleanup();
  }
}

/** Pixel size of each image the export will produce (for the dialog). */
export function estimateExportSizes(opts: Pick<ExportOptions, 'area' | 'resolution' | 'padding' | 'content'>): { width: number; height: number }[] {
  const flowEl = document.querySelector<HTMLElement>('.react-flow');
  if (!flowEl) return [];
  const full = { ...opts, format: 'png' as const, theme: 'light' as const, background: 'theme' as const, filename: '' };
  const content = opts.area === 'viewport' ? 'all' : opts.content;
  const parts: Part[] = content === 'separate' ? ['infrastructure', 'rules'] : [content];
  const out: { width: number; height: number }[] = [];
  for (const part of parts) {
    try {
      const frame = computeFrame(full, part, flowEl);
      const r = pixelRatioFor(opts.resolution, frame.width, frame.height);
      out.push({ width: Math.round(frame.width * r), height: Math.round(frame.height * r) });
    } catch {
      /* part not on the canvas yet (e.g. temporary rules table) */
    }
  }
  return out;
}
