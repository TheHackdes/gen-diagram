import { describe, expect, it } from 'vitest';
import { bond, edge, node } from '../../test/helpers';
import type { Vlan } from '../../types';
import { switchingLoops, vlanReachability } from './l2';

const V20: Vlan = { uid: 'v20', id: 20, name: 'Servers', subnet: '10.0.20.0/24', gateway: '10.0.20.1', color: '#000' };
const V99: Vlan = { uid: 'v99', id: 99, name: 'Mgmt', subnet: '10.0.99.0/24', gateway: '10.0.99.1', color: '#000' };

describe('switching loops', () => {
  const triangle = (stp?: string) => {
    const a = node('switch', 'a', stp ? { stp } : {});
    const b = node('switch', 'b', stp ? { stp } : {});
    const c = node('switch', 'c', stp ? { stp } : {});
    return { nodes: [a, b, c], edges: [edge('ab', 'a', 'b'), edge('bc', 'b', 'c'), edge('ca', 'c', 'a')] };
  };

  it('flags a cycle of switches without STP', () => {
    const { nodes, edges } = triangle();
    const r = switchingLoops(nodes, edges, []);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ severity: 'warning' });
    expect(r[0].edgeIds?.sort()).toEqual(['ab', 'bc', 'ca']);
  });

  it('is informative when STP runs everywhere, an error when it is disabled', () => {
    const on = triangle('rstp');
    expect(switchingLoops(on.nodes, on.edges, [])[0].severity).toBe('info');
    const off = triangle('off');
    expect(switchingLoops(off.nodes, off.edges, [])[0].severity).toBe('error');
  });

  it('a tree, a bond and an MLAG pair are not loops', () => {
    const core1 = node('l3-switch', 'core1', { redundancyGroup: 'vpc' });
    const core2 = node('l3-switch', 'core2', { redundancyGroup: 'vpc' });
    const acc = node('switch', 'acc');
    const leaf = node('switch', 'leaf');
    const up1 = edge('u1', 'acc', 'core1');
    const up2 = edge('u2', 'acc', 'core2');
    const peer = edge('pl', 'core1', 'core2');
    const l1 = edge('l1', 'leaf', 'acc');
    const l2 = edge('l2', 'leaf', 'acc');
    const bonds = [bond('mlag', 'lacp', [up1, up2]), bond('po2', 'lacp', [l1, l2])];
    expect(switchingLoops([core1, core2, acc, leaf], [up1, up2, peer, l1, l2], bonds)).toEqual([]);
  });

  it('two separate bonds between the same switches loop', () => {
    const a = node('switch', 'x1');
    const b = node('switch', 'x2');
    const e = [edge('p1', 'x1', 'x2'), edge('p2', 'x1', 'x2'), edge('p3', 'x1', 'x2'), edge('p4', 'x1', 'x2')];
    const bonds = [bond('b1', 'lacp', [e[0], e[1]]), bond('b2', 'lacp', [e[2], e[3]])];
    expect(switchingLoops([a, b], e, bonds)).toHaveLength(1);
  });
});

describe('VLAN reachability', () => {
  const setup = (trunk: string) => {
    const core = node('l3-switch', 'core', { ip: '10.0.20.1', vlan: '20', ips: [{ address: '10.0.99.1', vlan: '99' }] });
    const acc = node('switch', 'acc', { ip: '10.0.99.2', vlan: '99' });
    const srv = node('server', 'srv', { ip: '10.0.20.10', vlan: '20' });
    const edges = [edge('up', 'acc', 'core', { mode: 'trunk', vlan: trunk }), edge('down', 'srv', 'acc', { mode: 'access', vlan: '20' })];
    return { nodes: [core, acc, srv], edges };
  };

  it('flags a VLAN missing on the uplink to its gateway', () => {
    const { nodes, edges } = setup('99');
    const r = vlanReachability(nodes, edges, [V20, V99]);
    expect(r).toHaveLength(1);
    expect(r[0].message).toMatch(/VLAN 20 does not reach its gateway: acc ↔ core trunk \(VLANs 99\).*srv/);
    expect(r[0].edgeIds).toEqual(['up']);
  });

  it('accepts a trunk that carries the VLAN, or an undocumented one', () => {
    expect(vlanReachability(...Object.values(setup('20,99')) as [never, never], [V20, V99])).toEqual([]);
    expect(vlanReachability(...Object.values(setup('')) as [never, never], [V20, V99])).toEqual([]);
  });

  it('guests use the uplink of their hypervisor', () => {
    const core = node('l3-switch', 'core2', { ip: '10.0.20.1', vlan: '20', ips: [{ address: '10.0.99.1', vlan: '99' }] });
    const pve = node('proxmox', 'pve', { ip: '10.0.20.10', vlan: '20' });
    const vm = node('vm', 'vm', { ip: '10.0.99.50', vlan: '99' }, 'pve');
    const r = vlanReachability([core, pve, vm], [edge('t', 'pve', 'core2', { mode: 'trunk', vlan: '20' })], [V20, V99]);
    expect(r).toHaveLength(1);
    expect(r[0].message).toMatch(/VLAN 99 .*pve ↔ core2.*\(used by vm\)/);
  });
});
