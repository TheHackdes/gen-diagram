import { useDeferredValue } from 'react';
import { useDiagram } from '../../store/diagramStore';
import type { Bond, InfraEdge, InfraNode, ValidationIssue, Vlan } from '../../types';
import { validateDiagram } from './validate';

interface Cache {
  nodes: InfraNode[];
  edges: InfraEdge[];
  vlans: Vlan[];
  bonds: Bond[];
  result: ValidationIssue[];
}

/** Positions do not affect validation: only data, hierarchy, links and VLANs do. */
function sameStructure(a: InfraNode[], b: InfraNode[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].data !== b[i].data || a[i].parentId !== b[i].parentId || a[i].id !== b[i].id) return false;
  }
  return true;
}

/** Shared across components: the status bar and the issues panel reuse one computation. */
let cache: Cache | null = null;

export function useValidation(): ValidationIssue[] {
  const nodes = useDeferredValue(useDiagram((s) => s.nodes));
  const edges = useDeferredValue(useDiagram((s) => s.edges));
  const vlans = useDeferredValue(useDiagram((s) => s.vlans));
  const bonds = useDeferredValue(useDiagram((s) => s.bonds));
  const c = cache;
  if (c && c.edges === edges && c.vlans === vlans && c.bonds === bonds && sameStructure(c.nodes, nodes)) return c.result;
  const result = validateDiagram(nodes, edges, vlans, bonds);
  cache = { nodes, edges, vlans, bonds, result };
  return result;
}
