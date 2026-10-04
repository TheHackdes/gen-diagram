import type { ReactFlowInstance } from '@xyflow/react';
import type { InfraEdge, InfraNode } from '../../types';

/** Access to the live React Flow instance outside React components. */
export const flowApi: { instance: ReactFlowInstance<InfraNode, InfraEdge> | null } = { instance: null };

export function fitDiagram(duration = 400): void {
  // Wait one frame so freshly laid-out nodes are measured.
  requestAnimationFrame(() => {
    void flowApi.instance?.fitView({ padding: 0.12, duration, maxZoom: 1.25 });
  });
}
