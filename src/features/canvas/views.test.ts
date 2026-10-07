import { describe, expect, it } from 'vitest';
import { edge, node } from '../../test/helpers';
import { applyView, layerOfEdge, layerOfNode, VIEW_PRESETS } from './views';

const preset = (id: string) => {
  const p = VIEW_PRESETS.find((x) => x.id === id)!;
  return { preset: p.id, hidden: p.hidden };
};

describe('views and layers', () => {
  it('puts each element in a layer', () => {
    expect(layerOfNode(node('switch', 'sw'))).toBe('network');
    expect(layerOfNode(node('proxmox', 'pve'))).toBe('compute');
    expect(layerOfNode(node('vm', 'vm'))).toBe('virtual');
    expect(layerOfNode(node('vlan-zone', 'z'))).toBe('zones');
    expect(layerOfNode(node('fw-table', 't'))).toBe('rules');
    expect(layerOfEdge(edge('e', 'a', 'b', { connType: 'logical' }))).toBe('flows');
    expect(layerOfEdge(edge('e', 'a', 'b', { connType: 'vpn' }))).toBe('tunnels');
  });

  it('the physical view hides guests and their links, keeps the project untouched', () => {
    const sw = node('switch', 'sw1');
    const pve = node('proxmox', 'pve1');
    const vm = node('vm', 'vm1', {}, 'pve1');
    const nodes = [sw, pve, vm];
    const edges = [edge('c', 'sw1', 'pve1'), edge('f', 'vm1', 'sw1', { connType: 'logical' })];
    const r = applyView(nodes, edges, preset('physical'));
    expect(r.nodes.find((n) => n.id === 'vm1')?.hidden).toBe(true);
    // The host stays, shrunk to its header since its only guest is hidden.
    const host = r.nodes.find((n) => n.id === 'pve1')!;
    expect(host.hidden).toBeUndefined();
    expect(host.height!).toBeLessThan(pve.height!);
    expect(r.nodes.find((n) => n.id === 'sw1')).toBe(sw);
    expect(r.edges.find((e) => e.id === 'f')?.hidden).toBe(true);
    expect(r.edges.find((e) => e.id === 'c')).toBe(edges[0]);
    expect(r.hidden).toBe(2);
    expect(vm.hidden).toBeUndefined();
    // Same inputs, same copies (no re-render).
    expect(applyView(nodes, edges, preset('physical')).nodes[2]).toBe(r.nodes[2]);
  });

  it('the security view dims what does not filter traffic', () => {
    const fw = node('firewall', 'fw1');
    const web = node('web-server', 'web1', { fw: true });
    const pc = node('pc', 'pc1');
    const r = applyView([fw, web, pc], [edge('a', 'fw1', 'pc1'), edge('b', 'pc1', 'pc1')], preset('security'));
    expect(r.nodes.map((n) => n.className ?? '')).toEqual(['', '', 'view-dim']);
    expect(r.edges[0].data?._focus).toBeUndefined();
    expect(r.edges[1].data?._focus).toBe('muted');
  });

  it('everything: nothing changes', () => {
    const nodes = [node('switch', 'x')];
    const edges: never[] = [];
    expect(applyView(nodes, edges, { preset: 'all', hidden: [] }).nodes).toBe(nodes);
  });
});
