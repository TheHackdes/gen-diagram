import { describe, expect, it } from 'vitest';
import { getDefinition } from '../../data/catalog';
import { useDiagram } from '../../store/diagramStore';
import { node } from '../../test/helpers';
import { cardFieldsAbove, DEFAULT_HEADER_FIELDS, headerFieldsOf, headerOptionsFor } from './groupDisplay';
import { indexById } from './hierarchy';
import { requiredHeight } from './ips';

const threeIps = { ip: '10.0.0.1', ips: [{ address: '10.0.0.2' }, { address: '10.0.0.3' }], fw: true };

describe('group header', () => {
  it('shows what it showed before by default', () => {
    expect(headerFieldsOf(node('vlan-zone', 'z'))).toEqual(DEFAULT_HEADER_FIELDS);
    expect(headerFieldsOf(node('group', 'g', { headerFields: ['name', 'count', 'bogus'] }))).toEqual(['name', 'count']);
  });

  it('only offers what makes sense for the type', () => {
    const keys = (type: string) => headerOptionsFor(getDefinition(type)).map((f) => f.key);
    expect(keys('group')).toEqual(['icon', 'name', 'count', 'description']);
    expect(keys('vlan-zone')).toContain('vlan');
    expect(keys('vlan-zone')).toContain('subnet');
  });
});

describe('member cards', () => {
  it('follow the nearest group that chooses, through hosts', () => {
    const outer = node('vlan-zone', 'outer', { cardFields: ['ip'] });
    const inner = node('group', 'inner', { cardFields: ['os'] }, 'outer');
    const free = node('group', 'free', {}, 'inner');
    const pve = node('proxmox', 'pve', {}, 'outer');
    const byId = indexById([outer, inner, free, pve]);
    expect(cardFieldsAbove('free', byId)).toEqual(['os']);
    expect(cardFieldsAbove('pve', byId)).toEqual(['ip']);
    expect(cardFieldsAbove(undefined, byId)).toBeUndefined();
  });

  it('are shorter when addresses, details and badges are hidden', () => {
    const srv = node('server', 'srv', threeIps);
    const full = requiredHeight(srv);
    expect(requiredHeight(srv, ['ip', 'services', 'details'])).toBe(full);
    expect(requiredHeight(srv, ['vlan'])).toBe(getDefinition('server').size.height);
  });

  it('take their new height when the group changes what they show, and their full height outside', () => {
    const g = node('group', 'g');
    g.position = { x: 0, y: 0 };
    g.width = 600;
    g.height = 400;
    const srv = node('server', 'srv', threeIps, 'g');
    srv.position = { x: 40, y: 80 };
    srv.height = requiredHeight(srv);
    const full = srv.height;
    useDiagram.setState({ nodes: [g, srv] });
    useDiagram.getState().updateNodeProps('g', { cardFields: ['vlan'] });
    const get = () => useDiagram.getState().nodes.find((n) => n.id === 'srv')!;
    expect(get().height).toBeLessThan(full);

    useDiagram.getState().detachFromParent('srv');
    expect(get().parentId).toBeUndefined();
    expect(get().height).toBe(full);
  });

  it('re-stack an arranged group when their height changes', () => {
    const g = node('group', 'g', { arrange: 'list', arrangeGap: 10 });
    const a = node('server', 'a', threeIps, 'g');
    const b = node('server', 'b', {}, 'g');
    a.position = { x: 0, y: 50 };
    b.position = { x: 0, y: 500 };
    useDiagram.setState({ nodes: [g, a, b] });
    useDiagram.getState().refreshCompact(['g']);
    useDiagram.getState().updateNodeProps('g', { cardFields: ['vlan'] });
    const nodes = useDiagram.getState().nodes;
    const na = nodes.find((n) => n.id === 'a')!;
    const nb = nodes.find((n) => n.id === 'b')!;
    expect(nb.position.y).toBe(na.position.y + na.height! + 10);
  });
});
