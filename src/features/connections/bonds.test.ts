import { describe, expect, it } from 'vitest';
import { bond, edge, node } from '../../test/helpers';
import { analyzeBond, bondCapacity, migrateLegacyBonds, modeInfo, suggestBondNames } from './bonds';

const errors = (r: ReturnType<typeof analyzeBond>) => r.problems.filter((p) => p.severity === 'error');

describe('bond sides and rules', () => {
  const srv = node('server', 'srv');
  const swA = node('switch', 'swA');
  const swB = node('switch', 'swB');
  const swAg = node('switch', 'swAg', { redundancyGroup: 'mlag-1' });
  const swBg = node('switch', 'swBg', { redundancyGroup: 'mlag-1' });

  it('same source and destination (classic LACP) is valid', () => {
    const m = [edge('e1', 'srv', 'swA'), edge('e2', 'srv', 'swA')];
    const b = bond('b', 'lacp', m);
    const r = analyzeBond(b, m, [srv, swA]);
    expect(r.sides).toEqual([['srv'], ['swA']]);
    expect(errors(r)).toEqual([]);
    expect(r.capacity).toBe('2×10 Gbps = 20 Gbps');
  });

  it('one host to two switches: LACP needs an MLAG/stack group', () => {
    const m = [edge('e1', 'srv', 'swA'), edge('e2', 'srv', 'swB')];
    const r = analyzeBond(bond('b', 'lacp', m), m, [srv, swA, swB]);
    expect(r.sides).toEqual([['srv'], ['swA', 'swB']]);
    expect(errors(r)[0].message).toMatch(/stack \/ MLAG \/ vPC group/);
  });

  it('one host to two switches of the same MLAG group is valid (different destinations)', () => {
    const m = [edge('e1', 'srv', 'swAg'), edge('e2', 'srv', 'swBg')];
    const r = analyzeBond(bond('b', 'lacp', m), m, [srv, swAg, swBg]);
    expect(errors(r)).toEqual([]);
  });

  it('active-backup works across independent switches', () => {
    const m = [edge('e1', 'srv', 'swA'), edge('e2', 'srv', 'swB')];
    const r = analyzeBond(bond('b', 'active-backup', m), m, [srv, swA, swB]);
    expect(errors(r)).toEqual([]);
    expect(r.capacity).toBe('2×10 Gbps'); // no bandwidth sum for a standby link
  });

  it('different sources and different destinations (A→B, C→D) form two sides', () => {
    const a = node('switch', 'A', { redundancyGroup: 'pair-1' });
    const c = node('switch', 'C', { redundancyGroup: 'pair-1' });
    const b = node('switch', 'B', { redundancyGroup: 'pair-2' });
    const d = node('switch', 'D', { redundancyGroup: 'pair-2' });
    const m = [edge('e1', 'A', 'B'), edge('e2', 'C', 'D')];
    const r = analyzeBond(bond('po', 'lacp', m), m, [a, b, c, d]);
    expect(r.sides).toEqual([['A', 'C'], ['B', 'D']]);
    expect(errors(r)).toEqual([]);
  });

  it('redundancy groups decide the sides even when links are drawn in opposite directions', () => {
    const a = node('switch', 'A2', { redundancyGroup: 'p1' });
    const c = node('switch', 'C2', { redundancyGroup: 'p1' });
    const b = node('switch', 'B2', { redundancyGroup: 'p2' });
    const d = node('switch', 'D2', { redundancyGroup: 'p2' });
    // C2 ← D2 drawn backwards
    const m = [edge('e1', 'A2', 'B2'), edge('e2', 'D2', 'C2'), edge('e3', 'A2', 'D2'), edge('e4', 'C2', 'B2')];
    const r = analyzeBond(bond('po', 'lacp', m), m, [a, b, c, d]);
    expect(r.sides.map((s) => s.sort())).toEqual([['A2', 'C2'], ['B2', 'D2']]);
    expect(errors(r)).toEqual([]);
  });

  it('A→B, C→D without groups: sides follow the drawing, LACP is rejected', () => {
    const nodes = ['A3', 'B3', 'C3', 'D3'].map((x) => node('switch', x));
    const m = [edge('e1', 'A3', 'B3'), edge('e2', 'C3', 'D3')];
    const r = analyzeBond(bond('po', 'lacp', m), m, nodes);
    expect(r.sides).toEqual([['A3', 'C3'], ['B3', 'D3']]);
    expect(errors(r)).toHaveLength(2);
  });

  it('switch-independent modes need a single host on one side', () => {
    const nodes = ['A4', 'B4', 'C4', 'D4'].map((x) => node('server', x));
    const m = [edge('e1', 'A4', 'B4'), edge('e2', 'C4', 'D4')];
    const r = analyzeBond(bond('b', 'balance-alb', m), m, nodes);
    expect(errors(r)[0].message).toMatch(/single host/);
  });

  it('multipath and redundant paths accept any combination and link type', () => {
    const nodes = ['A5', 'B5', 'C5'].map((x) => node('server', x));
    const m = [edge('e1', 'A5', 'B5', { connType: 'wan' }), edge('e2', 'C5', 'B5', { connType: 'vpn' })];
    expect(errors(analyzeBond(bond('g', 'redundancy', m), m, nodes))).toEqual([]);
  });

  it('a device on both sides is an impossible bond', () => {
    const nodes = ['X', 'Y', 'Z'].map((x) => node('switch', x));
    const m = [edge('e1', 'X', 'Y'), edge('e2', 'Y', 'Z'), edge('e3', 'Z', 'X')];
    expect(errors(analyzeBond(bond('b', 'lacp', m), m, nodes)).some((p) => /both sides/.test(p.message))).toBe(true);
  });

  it('a member inside one redundancy group is rejected', () => {
    const m = [edge('e1', 'swAg', 'swBg'), edge('e2', 'srv', 'swAg')];
    expect(errors(analyzeBond(bond('b', 'lacp', m), m, [srv, swAg, swBg])).some((p) => /same redundancy group/.test(p.message))).toBe(true);
  });

  it('LACP only bonds physical links', () => {
    const m = [edge('e1', 'srv', 'swA', { connType: 'wifi' }), edge('e2', 'srv', 'swA')];
    expect(errors(analyzeBond(bond('b', 'lacp', m), m, [srv, swA]))[0].message).toMatch(/only bonds cables/);
  });

  it('trunk links (VLAN type) can be aggregated like Ethernet', () => {
    const m = [edge('e1', 'srv', 'swA', { connType: 'vlan' }), edge('e2', 'srv', 'swA', { connType: 'vlan' })];
    expect(errors(analyzeBond(bond('b', 'lacp', m), m, [srv, swA]))).toEqual([]);
  });

  it('warns about mismatched speeds and VLANs; informs about single members', () => {
    const m = [edge('e1', 'srv', 'swA', { speed: '1 Gbps' }), edge('e2', 'srv', 'swA', { vlan: '20', mode: 'access' })];
    const r = analyzeBond(bond('b', 'lacp', m), m, [srv, swA]);
    expect(r.problems.map((p) => p.severity).sort()).toEqual(['warning', 'warning']);
    const one = [edge('e9', 'srv', 'swA')];
    expect(analyzeBond(bond('b1', 'lacp', one), one, [srv, swA]).problems[0].severity).toBe('info');
  });
});

describe('bond helpers', () => {
  it('capacity', () => {
    const m = [edge('a', 'x', 'y', { speed: '1 Gbps' }), edge('b', 'x', 'y', { speed: '10 Gbps' })];
    expect(bondCapacity(modeInfo('lacp'), m)).toBe('1 Gbps + 10 Gbps = 11 Gbps');
    expect(bondCapacity(modeInfo('active-backup'), m)).toBe('1 Gbps + 10 Gbps');
  });

  it('names: bondN on the host, PoN on network gear', () => {
    const nodes = [node('server', 'h'), node('switch', 's'), node('switch', 't')];
    expect(suggestBondNames([edge('a', 'h', 's')], nodes, [])).toEqual({ name: 'bond0', peerName: 'Po1' });
    expect(suggestBondNames([edge('a', 's', 't')], nodes, [{ id: 'x', name: 'Po1', mode: 'lacp' }])).toEqual({ name: 'Po2' });
  });

  it('migrates v1.3 pair-based bonds into separate Bond entities', () => {
    const edges = [
      edge('a', 'h1', 's', { bond: 'bond0 / Po1', bondMode: 'LACP (802.3ad)' }),
      edge('b', 's', 'h1', { bond: 'bond0 / Po1', bondMode: 'LACP (802.3ad)' }),
      edge('c', 'h2', 's', { bond: 'bond0 / Po1', bondMode: 'Active-backup' }),
    ];
    const r = migrateLegacyBonds(edges, []);
    expect(r.bonds).toHaveLength(2); // same name on two different servers = two bonds
    expect(r.bonds[0]).toMatchObject({ name: 'bond0', peerName: 'Po1', mode: 'lacp' });
    expect(r.edges[0].data?.bondId).toBe(r.edges[1].data?.bondId);
    expect(r.edges[2].data?.bondId).not.toBe(r.edges[0].data?.bondId);
    expect(r.edges[0].data).not.toHaveProperty('bond');
  });
});
