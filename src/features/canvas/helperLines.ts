import type { NodePositionChange } from '@xyflow/react';
import type { InfraNode } from '../../types';
import { nodeSize } from '../nodes/hierarchy';

export interface GuideLine {
  /** Coordinates relative to the parent of the dragged node. */
  orientation: 'vertical' | 'horizontal';
  at: number;
  from: number;
  to: number;
}

export interface GuideResult {
  lines: GuideLine[];
  x?: number;
  y?: number;
}

/**
 * Alignment guides (Figma-like) between the dragged node and its siblings.
 * Returns the snapped position and the lines to display.
 */
export function computeGuides(change: NodePositionChange, nodes: InfraNode[], threshold = 6): GuideResult {
  const node = nodes.find((n) => n.id === change.id);
  if (!node || !change.position) return { lines: [] };
  const { width, height } = nodeSize(node);
  const a = { left: change.position.x, top: change.position.y, width, height };
  const ax = [a.left, a.left + width / 2, a.left + width];
  const ay = [a.top, a.top + height / 2, a.top + height];

  let bestX: { dist: number; delta: number; at: number; other: { top: number; bottom: number } } | undefined;
  let bestY: { dist: number; delta: number; at: number; other: { left: number; right: number } } | undefined;

  for (const other of nodes) {
    if (other.id === node.id || other.parentId !== node.parentId || other.selected) continue;
    const s = nodeSize(other);
    const bx = [other.position.x, other.position.x + s.width / 2, other.position.x + s.width];
    const by = [other.position.y, other.position.y + s.height / 2, other.position.y + s.height];
    for (let i = 0; i < 3; i++) {
      for (const target of bx) {
        const dist = Math.abs(ax[i] - target);
        // Only align like with like (edge-edge, center-center) plus edge to opposite edge.
        if (i === 1 && target !== bx[1]) continue;
        if (dist <= threshold && (!bestX || dist < bestX.dist)) {
          bestX = { dist, delta: target - ax[i], at: target, other: { top: other.position.y, bottom: other.position.y + s.height } };
        }
      }
      for (const target of by) {
        const dist = Math.abs(ay[i] - target);
        if (i === 1 && target !== by[1]) continue;
        if (dist <= threshold && (!bestY || dist < bestY.dist)) {
          bestY = { dist, delta: target - ay[i], at: target, other: { left: other.position.x, right: other.position.x + s.width } };
        }
      }
    }
  }

  const lines: GuideLine[] = [];
  const result: GuideResult = { lines };
  if (bestX) {
    result.x = a.left + bestX.delta;
    lines.push({
      orientation: 'vertical',
      at: bestX.at,
      from: Math.min(a.top, bestX.other.top) - 16,
      to: Math.max(a.top + height, bestX.other.bottom) + 16,
    });
  }
  if (bestY) {
    result.y = a.top + bestY.delta;
    const left = result.x ?? a.left;
    lines.push({
      orientation: 'horizontal',
      at: bestY.at,
      from: Math.min(left, bestY.other.left) - 16,
      to: Math.max(left + width, bestY.other.right) + 16,
    });
  }
  return result;
}
