import { useEffect } from 'react';
import { dockTables } from '../features/layout/autoLayout';
import { useDiagram } from '../store/diagramStore';

/** Firewall rule tables follow the right edge of the diagram whenever it changes. */
export function useDockedTables(): void {
  useEffect(() => {
    const apply = () => {
      const { nodes } = useDiagram.getState();
      const docked = dockTables(nodes);
      // dockTables returns the same array when nothing moves: no update loop.
      if (docked !== nodes) useDiagram.setState({ nodes: docked });
    };
    apply();
    return useDiagram.subscribe((s, prev) => {
      if (s.nodes !== prev.nodes) apply();
    });
  }, []);
}
