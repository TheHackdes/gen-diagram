import { getDefinition } from '../../data/catalog';
import type { InfraNode } from '../../types';

/** How the members of a group / zone are placed. */
export type ArrangeMode = 'free' | 'list' | 'row' | 'grid';

export interface Arrangement {
  mode: ArrangeMode;
  /** Grid columns (0 = automatic). */
  columns: number;
  /** Grid rows (0 = automatic). */
  rows: number;
  /** Space between members, in px. */
  gap: number;
}

export const ARRANGE_MODES: { value: ArrangeMode; label: string; title: string }[] = [
  { value: 'free', label: 'Free', title: 'Place members by hand' },
  { value: 'list', label: 'List', title: 'One column, top to bottom' },
  { value: 'row', label: 'Row', title: 'One row, left to right' },
  { value: 'grid', label: 'Grid', title: 'Rows and columns' },
];

export const DEFAULT_GAP = 20;

const MODES = new Set<string>(ARRANGE_MODES.map((m) => m.value));

const count = (v: unknown, max: number): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0;
};

/** Zones and groups can arrange their members. */
export function canArrange(n: InfraNode): boolean {
  const def = getDefinition(n.data.type);
  return def.renderer === 'zone' && def.accepts !== undefined;
}

/** Hosts, zones and groups can show their members as compact lines. */
export function canCompact(n: InfraNode): boolean {
  return getDefinition(n.data.type).kind === 'container' || canArrange(n);
}

export function arrangementOf(n: InfraNode | undefined): Arrangement {
  const p = n?.data.props ?? {};
  const raw = typeof p.arrange === 'string' && MODES.has(p.arrange) ? (p.arrange as ArrangeMode) : 'free';
  const gap = Number(p.arrangeGap);
  return {
    mode: n && canArrange(n) ? raw : 'free',
    columns: count(p.arrangeColumns, 50),
    rows: count(p.arrangeRows, 50),
    gap: Number.isFinite(gap) && gap >= 0 && p.arrangeGap !== '' && p.arrangeGap !== undefined ? Math.min(gap, 200) : DEFAULT_GAP,
  };
}

/** A group whose members are placed automatically (list, row or grid). */
export const isArranged = (n: InfraNode | undefined): boolean => !!n && arrangementOf(n).mode !== 'free';

/** Number of columns used to place `items` members. */
export function columnsFor(a: Arrangement, items: number): number {
  if (items <= 0) return 1;
  switch (a.mode) {
    case 'row':
      return items;
    case 'grid':
      if (a.columns) return a.columns;
      if (a.rows) return Math.ceil(items / a.rows);
      return Math.ceil(Math.sqrt(items));
    default:
      return 1;
  }
}

/** Members per column for compact lines (filled top to bottom, then the next column). */
export function linesPerColumn(a: Arrangement, items: number): number {
  // Only a grid splits lines into columns: a list or a row stays one column of lines.
  const cols = a.mode === 'grid' ? Math.min(columnsFor(a, items), Math.max(1, items)) : 1;
  const even = Math.ceil(items / cols);
  return a.mode === 'grid' && a.rows ? Math.max(a.rows, even) : even;
}

/** Columns actually used by `items` compact lines. */
export function compactColumns(a: Arrangement, items: number): number {
  return items > 0 ? Math.ceil(items / linesPerColumn(a, items)) : 1;
}
