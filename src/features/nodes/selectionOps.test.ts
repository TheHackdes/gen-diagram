import { describe, expect, it } from 'vitest';
import { useDiagram } from '../../store/diagramStore';
import { useUi } from '../../store/uiStore';
import { node } from '../../test/helpers';
import { alignNodes } from './operations';

describe('selection operations', () => {
  it('guests of a host are not grouped inside it (the host only holds guests)', () => {
    const pve = node('proxmox', 'pve');
    const vm1 = node('vm', 'vm1', {}, 'pve');
    const vm2 = node('vm', 'vm2', {}, 'pve');
    useDiagram.setState({ nodes: [pve, { ...vm1, selected: true }, { ...vm2, selected: true }], edges: [] });
    useUi.setState({ toasts: [] });
    useDiagram.getState().groupSelection();
    expect(useDiagram.getState().nodes.some((n) => n.data.type === 'group')).toBe(false);
    expect(useUi.getState().toasts[0]?.message).toMatch(/cannot be grouped/);
  });

  it('elements of a zone are grouped inside the zone', () => {
    const z = node('vlan-zone', 'z');
    const a = node('server', 'a', {}, 'z');
    useDiagram.setState({ nodes: [z, { ...a, selected: true }], edges: [] });
    useDiagram.getState().groupSelection();
    const g = useDiagram.getState().nodes.find((n) => n.data.type === 'group')!;
    expect(g.parentId).toBe('z');
    expect(useDiagram.getState().nodes.find((n) => n.id === 'a')!.parentId).toBe(g.id);
  });

  it('a selected child moves with its selected parent when aligning', () => {
    const z = node('vlan-zone', 'z');
    z.position = { x: 100, y: 0 };
    const a = node('server', 'a', {}, 'z');
    a.position = { x: 20, y: 60 };
    const b = node('server', 'b');
    b.position = { x: 0, y: 500 };
    const out = alignNodes([z, a, b], new Set(['z', 'a', 'b']), 'left');
    expect(out.find((n) => n.id === 'z')!.position.x).toBe(0);
    expect(out.find((n) => n.id === 'a')!.position).toEqual({ x: 20, y: 60 }); // still at its place inside the zone
  });
});
