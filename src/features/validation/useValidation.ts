import { useDeferredValue, useRef } from 'react';
import { useDiagram } from '../../store/diagramStore';
import type { InfraEdge, InfraNode, ValidationIssue, Vlan } from '../../types';
import { validateDiagram } from './validate';

interface Cache {
  nodes: InfraNode[];
  edges: InfraEdge[];
  vlans: Vlan[];
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

export function useValidation(): ValidationIssue[] {
  const nodes = useDeferredValue(useDiagram((s) => s.nodes));
  const edges = useDeferredValue(useDiagram((s) => s.edges));
  const vlans = useDeferredValue(useDiagram((s) => s.vlans));
  const cache = useRef<Cache | null>(null);
  const c = cache.current;
  if (c && c.edges === edges && c.vlans === vlans && sameStructure(c.nodes, nodes)) return c.result;
  const result = validateDiagram(nodes, edges, vlans);
  cache.current = { nodes, edges, vlans, result };
  return result;
}
