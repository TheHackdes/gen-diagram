import { describe, expect, it } from 'vitest';
import { bond, edge } from '../../test/helpers';
import { linkLabel } from './labels';

describe('link labels', () => {
  it('a bundle of parallel links is labelled once', () => {
    const edges = [edge('a', 'x', 'y'), edge('b', 'x', 'y')];
    expect(linkLabel(edges[0], edges, [])).toBe('2 links · 2×10 Gbps');
    expect(linkLabel(edges[1], edges, [])).toBe('');
  });

  it('a bond inside one bundle shows mode and total capacity', () => {
    const edges = [edge('a', 'srv', 'sw'), edge('b', 'srv', 'sw')];
    const b = { ...bond('b1', 'lacp', edges, 'bond0'), peerName: 'Po1' };
    expect(linkLabel(edges[0], edges, [b])).toBe('bond0 / Po1 · LACP · 2×10 Gbps = 20 Gbps');
  });

  it('a bond spread over two switches: summary on the first link, share on the others', () => {
    const edges = [edge('a', 'srv', 'sw1'), edge('b', 'srv', 'sw2')];
    const b = bond('b1', 'lacp', edges, 'bond0');
    expect(linkLabel(edges[0], edges, [b])).toBe('bond0 · LACP · 2×10 Gbps = 20 Gbps');
    // Tied to the first link by the bond mark at srv: no repeated label.
    expect(linkLabel(edges[1], edges, [b])).toBe('');
  });

  it('bond members without a shared device (A→B, C→D) carry the bond name', () => {
    const edges = [edge('a', 'A', 'B'), edge('b', 'C', 'D')];
    const b = { ...bond('b1', 'lacp', edges, 'Po20'), peerName: 'Po20' };
    expect(linkLabel(edges[0], edges, [b])).toBe('Po20 · LACP · 2×10 Gbps = 20 Gbps');
    expect(linkLabel(edges[1], edges, [b])).toBe('Po20 · 10 Gbps');
  });
});
