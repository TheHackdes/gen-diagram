import type { Bond, InfraEdge } from '../../types';
import { bondCapacity, bondMembers, bondSummary, bondTitle, modeInfo } from './bonds';
import { parallelEdges } from './parallel';

/**
 * Text of the label drawn in the middle of a link, or '' when another link
 * of the same bundle already carries the label.
 *
 * - Links between the same two devices form a bundle labelled once.
 * - A bond is summarised once (mode + capacity) by its first link; links of the
 *   bond that join other devices (MLAG, vPC) show the bond name and their share.
 */
export function linkLabel(edge: InfraEdge, edges: InfraEdge[], bonds: Bond[]): string {
  const bundle = parallelEdges(edges, edge);
  if (bundle[0]?.id !== edge.id) return '';
  const bond = bonds.find((b) => b.id === edge.data?.bondId);
  const own = [edge.data?.label, edge.data?.connType !== 'logical' ? edge.data?.speed : ''].filter(Boolean).join(' · ');

  if (bond) {
    const members = bondMembers(bond.id, edges);
    const inBundle = bundle.filter((e) => e.data?.bondId === bond.id);
    const whole = inBundle.length === members.length;
    if (whole || members[0]?.id === edge.id) return [edge.data?.label, bondSummary(bond, members)].filter(Boolean).join(' · ');
    // Members sharing a device with another member are already tied together by
    // the bond mark drawn at that device: no need to repeat the bond on each link.
    const ends = new Set([edge.source, edge.target]);
    const marked = members.some((m) => !inBundle.includes(m) && (ends.has(m.source) || ends.has(m.target)));
    if (marked) return edge.data?.label ?? '';
    const part = bondCapacity({ ...modeInfo(bond.mode), aggregatesBandwidth: false }, inBundle);
    return [edge.data?.label, bondTitle(bond), part].filter(Boolean).join(' · ');
  }
  if (bundle.length > 1) {
    return [edge.data?.label, `${bundle.length} links`, bondCapacity({ ...modeInfo('redundancy') }, bundle)].filter(Boolean).join(' · ');
  }
  return own;
}
