import { describe, expect, it } from 'vitest';
import { useDiagram } from '../../store/diagramStore';
import { node } from '../../test/helpers';
import { withLayer } from './factory';

function setup() {
  const zone = withLayer(node('vlan-zone', 'zone'));
  const inZone = node('server', 'inZone', {}, 'zone');
  const raised = node('server', 'raised');
  const group = withLayer(node('group', 'grp'));
  const member = node('server', 'member', {}, 'grp');
  useDiagram.setState({ nodes: [zone, inZone, raised, group, member], edges: [], clipboard: null });
  useDiagram.getState().bringToFront(['raised']);
}

const maxZ = (ids: Set<string>) => Math.max(...useDiagram.getState().nodes.filter((n) => !ids.has(n.id)).map((n) => n.zIndex ?? 0));

describe('pasted elements', () => {
  it('bring to front still raises a node above the others', () => {
    setup();
    expect(useDiagram.getState().nodes.find((n) => n.id === 'raised')!.zIndex).toBe(1);
  });

  for (const action of ['paste', 'duplicate'] as const) {
    it(`${action}: come in front of everything, their contents follow`, () => {
      setup();
      const before = new Set(useDiagram.getState().nodes.map((n) => n.id));
      const st = useDiagram.getState();
      st.select(['inZone', 'grp']);
      if (action === 'paste') {
        st.copySelection();
        useDiagram.getState().paste();
      } else st.duplicateSelection();
      const nodes = useDiagram.getState().nodes;
      const created = nodes.filter((n) => !before.has(n.id));
      const roots = created.filter((n) => !n.parentId || before.has(n.parentId));
      expect(roots).toHaveLength(2);
      for (const r of roots) expect(r.zIndex).toBeGreaterThan(maxZ(new Set(created.map((n) => n.id))));
      const child = created.find((n) => n.parentId && !before.has(n.parentId))!;
      expect(child.data.name).toMatch(/^member/);
      expect(child.zIndex).toBeUndefined();
    });
  }
});
