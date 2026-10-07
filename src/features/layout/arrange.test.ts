import { describe, expect, it } from 'vitest';
import { node } from '../../test/helpers';
import { COMPACT_ROW, managedAncestors } from '../nodes/ips';
import { indexById } from '../nodes/hierarchy';
import { relayoutContainer } from './autoLayout';

function group(props: Record<string, unknown>, count = 4) {
  const g = node('group', 'g', props);
  const kids = Array.from({ length: count }, (_, i) => {
    const k = node('server', `s${i}`, {}, 'g');
    k.position = { x: 20 + i * 7, y: 60 + i * 300 };
    return k;
  });
  return [g, ...kids];
}

const by = (nodes: ReturnType<typeof group>) => (id: string) => nodes.find((n) => n.id === id)!;

describe('arranged groups', () => {
  it('list: stacks members top to bottom, group hugs them', () => {
    const get = by(relayoutContainer(group({ arrange: 'list', arrangeGap: 10 }), [], 'g'));
    const xs = ['s0', 's1', 's2', 's3'].map((id) => get(id).position.x);
    expect(new Set(xs).size).toBe(1);
    expect(get('s1').position.y - get('s0').position.y).toBe(get('s0').height! + 10);
    expect(get('g').height).toBe(get('s3').position.y + get('s3').height! + 24);
  });

  it('row: places members left to right', () => {
    const get = by(relayoutContainer(group({ arrange: 'row' }), [], 'g'));
    expect(get('s0').position.y).toBe(get('s3').position.y);
    expect(get('s1').position.x).toBeGreaterThan(get('s0').position.x);
  });

  it('grid: honours columns, and rows when columns are automatic', () => {
    let get = by(relayoutContainer(group({ arrange: 'grid', arrangeColumns: 3 }, 5), [], 'g'));
    expect(get('s0').position.y).toBe(get('s2').position.y);
    expect(get('s3').position.y).toBeGreaterThan(get('s0').position.y);
    expect(get('s3').position.x).toBe(get('s0').position.x);

    get = by(relayoutContainer(group({ arrange: 'grid', arrangeRows: 2 }, 6), [], 'g'));
    const rows = new Set(['s0', 's1', 's2', 's3', 's4', 's5'].map((id) => get(id).position.y));
    expect(rows.size).toBe(2);
  });

  it('a member dropped elsewhere takes that place', () => {
    const laid = relayoutContainer(group({ arrange: 'list' }), [], 'g');
    const moved = laid.map((n) => (n.id === 's3' ? { ...n, position: { ...n.position, y: 0 } } : n));
    const get = by(relayoutContainer(moved, [], 'g'));
    expect(get('s3').position.y).toBeLessThan(get('s0').position.y);
  });

  it('compact grid: lines split into columns', () => {
    const get = by(relayoutContainer(group({ compact: true, arrange: 'grid', arrangeColumns: 2 }), [], 'g'));
    expect(get('s0').height).toBe(COMPACT_ROW);
    expect(get('s0').position.x).toBe(get('s1').position.x); // filled top to bottom
    expect(get('s2').position.x).toBeGreaterThan(get('s0').position.x);
    expect(get('s2').position.y).toBe(get('s0').position.y);
  });

  it('re-arranges the arranged groups around a changed member, innermost first', () => {
    const outer = node('group', 'outer', { arrange: 'grid' });
    const inner = node('vlan-zone', 'inner', { arrange: 'list' }, 'outer');
    const free = node('group', 'free', {}, 'inner');
    const leaf = node('server', 'leaf', {}, 'free');
    expect(managedAncestors('leaf', indexById([outer, inner, free, leaf])).map((n) => n.id)).toEqual(['inner', 'outer']);
  });
});
