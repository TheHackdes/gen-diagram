import { cmpId } from '../../utils/misc';
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
export function linkLabel(edge: InfraEdge, edges: InfraEdge[], bonds: Bond[], ctx?: LabelContext): string {
  const bundle = ctx ? (ctx.bundles.get(pairKey(edge)) ?? [edge]) : parallelEdges(edges, edge);
  if (bundle[0]?.id !== edge.id) return '';
  const bond = bonds.find((b) => b.id === edge.data?.bondId);
  const own = [edge.data?.label, edge.data?.connType !== 'logical' ? edge.data?.speed : ''].filter(Boolean).join(' · ');

  if (bond) {
    const members = ctx ? (ctx.members.get(bond.id) ?? []) : bondMembers(bond.id, edges);
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

const pairKey = (e: Pick<InfraEdge, 'source' | 'target'>) => (e.source < e.target ? `${e.source}|${e.target}` : `${e.target}|${e.source}`);

interface LabelContext {
  bundles: Map<string, InfraEdge[]>;
  members: Map<string, InfraEdge[]>;
}

export interface LabelInfo {
  /** Text of the label ('' when none). */
  text: string;
  /** First link of its bundle: the one that draws the label. */
  owner: boolean;
}

const indexCache = new WeakMap<InfraEdge[], { bonds: Bond[]; map: Map<string, LabelInfo> }>();

/**
 * Labels of every link, computed once per change of the links or bonds
 * (not on every frame while dragging) — linear in the number of links.
 */
export function labelIndex(edges: InfraEdge[], bonds: Bond[]): Map<string, LabelInfo> {
  const hit = indexCache.get(edges);
  if (hit && hit.bonds === bonds) return hit.map;
  const bundles = new Map<string, InfraEdge[]>();
  const members = new Map<string, InfraEdge[]>();
  for (const e of edges) {
    const k = pairKey(e);
    bundles.set(k, [...(bundles.get(k) ?? []), e]);
    const b = e.data?.bondId;
    if (b) members.set(b, [...(members.get(b) ?? []), e]);
  }
  for (const list of [...bundles.values(), ...members.values()]) list.sort((a, b) => cmpId(a.id, b.id));
  const ctx = { bundles, members };
  const map = new Map<string, LabelInfo>();
  for (const e of edges) map.set(e.id, { text: linkLabel(e, edges, bonds, ctx), owner: bundles.get(pairKey(e))![0].id === e.id });
  indexCache.set(edges, { bonds, map });
  return map;
}
