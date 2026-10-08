import { describe, expect, it } from 'vitest';
import { useDiagram } from '../../store/diagramStore';
import { bond, edge, node } from '../../test/helpers';
import { buildDocument } from '../docs/document';
import { switchingLoops } from '../validation/l2';
import { analyzeBond, bondSuggestions, canJoinBond, memberTargets, suggestBondMode } from './bonds';

const srv = node('server', 'srv');
const swA = node('switch', 'swA');
const swB = node('switch', 'swB');
const m1 = node('switch', 'm1', { redundancyGroup: 'mlag' });
const m2 = node('switch', 'm2', { redundancyGroup: 'mlag' });
const s1 = node('switch', 's1', { redundancyGroup: 'stack' });
const s2 = node('switch', 's2', { redundancyGroup: 'stack' });
const r1 = node('router', 'r1');
const r2 = node('router', 'r2');
const isp1 = node('internet', 'isp1');
const isp2 = node('internet', 'isp2');
const nodes = [srv, swA, swB, m1, m2, s1, s2, r1, r2, isp1, isp2];

describe('mode of a new bond', () => {
  it('same source and destination → LACP', () => {
    expect(suggestBondMode([edge('a', 'srv', 'swA'), edge('b', 'srv', 'swA')], nodes)).toBe('lacp');
  });
  it('host → two switches of an MLAG pair (different destinations) → LACP', () => {
    expect(suggestBondMode([edge('a', 'srv', 'm1'), edge('b', 'srv', 'm2')], nodes)).toBe('lacp');
  });
  it('host → two independent switches → active-backup', () => {
    expect(suggestBondMode([edge('a', 'srv', 'swA'), edge('b', 'srv', 'swB')], nodes)).toBe('active-backup');
  });
  it('stack → MLAG pair (different sources and destinations) → LACP', () => {
    expect(suggestBondMode([edge('a', 's1', 'm1'), edge('b', 's2', 'm2')], nodes)).toBe('lacp');
  });
  it('independent paths (dual WAN: R1→ISP1, R2→ISP2) → redundancy group', () => {
    expect(suggestBondMode([edge('a', 'r1', 'isp1'), edge('b', 'r2', 'isp2')], nodes)).toBe('redundancy');
  });
  it('logical links → redundancy group', () => {
    expect(suggestBondMode([edge('a', 'srv', 'swA', { connType: 'logical' }), edge('b', 'srv', 'swB', { connType: 'logical' })], nodes)).toBe('redundancy');
  });
});

describe('links that can be bonded together', () => {
  it('suggests parallel links, links from the same device and stack ↔ MLAG links', () => {
    const base = edge('base', 's1', 'm1');
    const all = [base, edge('par', 's1', 'm1'), edge('peer', 's2', 'm2'), edge('same', 's1', 'swA'), edge('far', 'r1', 'isp1'), edge('peerlink', 'm1', 'm2')];
    const got = bondSuggestions(base, all, nodes);
    expect(got.map((x) => [x.edge.id, x.reason])).toEqual([
      ['par', 'parallel'],
      ['same', 'shared-device'],
      ['peer', 'group'],
    ]);
    // A peer link inside the MLAG pair is never part of the bond; unrelated links are not offered.
  });

  it('a bond accepts a link only if it stays valid', () => {
    const lacp = bond('po', 'lacp', [edge('a', 'srv', 'm1')]);
    const members = [edge('a', 'srv', 'm1', { bondId: 'po' })];
    expect(canJoinBond(lacp, edge('x', 'srv', 'm2'), members, nodes)).toBe(true); // MLAG peer
    expect(canJoinBond(lacp, edge('y', 'srv', 'swA'), members, nodes)).toBe(false); // not in the MLAG group
    const red = bond('red', 'redundancy', []);
    const wan = [edge('w1', 'r1', 'isp1', { bondId: 'red' })];
    expect(canJoinBond(red, edge('w2', 'r2', 'isp2'), wan, nodes)).toBe(true); // any devices
    expect(canJoinBond(red, edge('w3', 'isp1', 'r1'), wan, nodes)).toBe(true);
    // A link putting a device on both sides is refused.
    const two = [edge('a1', 'srv', 'swA', { bondId: 'ab' }), edge('a2', 'srv', 'swB', { bondId: 'ab' })];
    expect(canJoinBond(bond('ab', 'active-backup', []), edge('bad', 'swA', 'swB'), two, nodes)).toBe(false);
  });

  it('new members can go to the MLAG peer of the other side', () => {
    const b = bond('po', 'lacp', []);
    const members = [edge('a', 'srv', 'm1', { bondId: 'po' })];
    expect(memberTargets(b, members, nodes)).toEqual([
      { from: 'srv', to: 'm1' },
      { from: 'srv', to: 'm2' },
    ]);
  });
});

describe('bonds in the store, the docs and the loop check', () => {
  it('creates a valid bond and adds a member towards the MLAG peer', () => {
    useDiagram.setState({ nodes, edges: [edge('a', 'srv', 'm1')], bonds: [] });
    const id = useDiagram.getState().createBond(['a'])!;
    expect(useDiagram.getState().bonds[0].mode).toBe('lacp');
    const added = useDiagram.getState().addBondMember(id, 'srv', 'm2')!;
    const st = useDiagram.getState();
    const e = st.edges.find((x) => x.id === added)!;
    expect(e.data?.bondId).toBe(id);
    expect(e.data?.sourcePort).not.toBe(st.edges.find((x) => x.id === 'a')!.data?.sourcePort);
    const r = analyzeBond(st.bonds[0], st.edges, st.nodes);
    expect(r.sides).toEqual([['srv'], ['m1', 'm2']]);
    expect(r.problems.filter((p) => p.severity === 'error')).toEqual([]);
  });

  it('docs show the two sides of a bond', () => {
    const members = [edge('a', 'srv', 'm1'), edge('b', 'srv', 'm2')];
    const b = bond('po', 'lacp', members, 'bond0');
    const doc = buildDocument({ name: 'x', nodes, edges: members, vlans: [], bonds: [b], issues: [] }, ['bonds']);
    expect(doc.sections[0].tables[0].rows[0][3]).toBe('srv ↔ m1 + m2');
  });

  it('a switch bonded active-backup to two independent switches is not a loop', () => {
    const core = node('switch', 'core');
    const links = [edge('u1', 'core', 'swA'), edge('u2', 'core', 'swB'), edge('x', 'swA', 'swB')];
    expect(switchingLoops([core, swA, swB], links, [])).toHaveLength(1);
    const ab = bond('ab', 'active-backup', [links[0], links[1]]);
    expect(switchingLoops([core, swA, swB], links, [ab])).toHaveLength(0);
    // LACP towards independent switches is not a valid single path: still a loop.
    const lacpLinks = [edge('v1', 'core', 'swA'), edge('v2', 'core', 'swB'), links[2]];
    const lacp = bond('lacp', 'lacp', [lacpLinks[0], lacpLinks[1]]);
    expect(switchingLoops([core, swA, swB], lacpLinks, [lacp])).toHaveLength(1);
  });
});
