import type { InfraEdge } from '../../types';

/** Several links drawn between the same two devices (a visual bundle). */

const pairKey = (e: Pick<InfraEdge, 'source' | 'target'>) => [e.source, e.target].sort().join('|');

/** All links between the same two nodes as `edge` (including itself), in a stable order. */
export function parallelEdges(edges: InfraEdge[], edge: Pick<InfraEdge, 'source' | 'target'>): InfraEdge[] {
  const key = pairKey(edge);
  return edges.filter((e) => pairKey(e) === key).sort((a, b) => a.id.localeCompare(b.id));
}

/** "10 Gbps" → 10000 (Mbps), for capacity sums. */
export function parseSpeed(speed: string | undefined): number | null {
  const m = (speed ?? '').trim().match(/^([\d.]+)\s*(M|G|T)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2].toUpperCase() === 'M' ? n : m[2].toUpperCase() === 'G' ? n * 1000 : n * 1_000_000;
}

