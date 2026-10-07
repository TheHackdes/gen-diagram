import { useDiagram } from '../../store/diagramStore';
import { useUi } from '../../store/uiStore';

/**
 * Level of detail for large diagrams. Below these zooms the text is unreadable
 * anyway, so cards show only icon + name and link labels are skipped. Small
 * diagrams always keep every detail; exports always render full detail.
 */
export const LOD = {
  /** Under this zoom, device cards are simplified. */
  cardZoom: 0.4,
  /** Under this zoom, link labels and port names are not drawn. */
  labelZoom: 0.3,
  /** Diagrams with fewer elements are never simplified. */
  minNodes: 150,
};

export function isLargeDiagram(): boolean {
  return useDiagram.getState().nodes.length >= LOD.minNodes;
}

function simplified(zoom: number, threshold: number): boolean {
  if (useUi.getState().exporting) return false;
  return zoom < threshold && isLargeDiagram();
}

export const lowDetailCards = (zoom: number) => simplified(zoom, LOD.cardZoom);
export const hideLinkText = (zoom: number) => simplified(zoom, LOD.labelZoom);
