import { describe, expect, it } from 'vitest';
import { node } from '../../test/helpers';
import { COMPACT_ROW } from '../nodes/ips';
import { dockTables, relayoutContainer } from './autoLayout';

function host() {
  const pve = node('proxmox', 'pve', { compact: true });
  const vm = node('vm', 'vm1', {}, 'pve');
  vm.position = { x: 300, y: 200 };
  const ct = node('lxc', 'ct1', {}, 'pve');
  ct.position = { x: 20, y: 60 };
  const dock = node('docker-host', 'dock', {}, 'pve');
  dock.position = { x: 20, y: 400 };
  const c1 = node('docker-container', 'nginx', {}, 'dock');
  return [pve, vm, ct, dock, c1];
}

describe('compact hosts', () => {
  it('stacks guests as full-width lines in their vertical order', () => {
    const out = relayoutContainer(host(), [], 'pve');
    const get = (id: string) => out.find((n) => n.id === id)!;
    const pve = get('pve');
    expect(get('ct1').position.y).toBeLessThan(get('vm1').position.y); // was higher
    expect(get('vm1').position.y).toBeLessThan(get('dock').position.y);
    for (const id of ['ct1', 'vm1']) {
      expect(get(id).height).toBe(COMPACT_ROW);
      expect(get(id).width).toBe(pve.width! - 20);
    }
    // nested Docker host: a block containing its own line
    expect(get('nginx').height).toBe(COMPACT_ROW);
    expect(get('dock').height).toBeGreaterThan(COMPACT_ROW * 2);
    expect(pve.height).toBeGreaterThan(get('dock').position.y + get('dock').height!);
  });

  it('back to cards restores the normal guest size', () => {
    const compacted = relayoutContainer(host(), [], 'pve');
    const off = compacted.map((n) => (n.id === 'pve' ? { ...n, data: { ...n.data, props: { ...n.data.props, compact: false } } } : n));
    const out = relayoutContainer(off, [], 'pve');
    expect(out.find((n) => n.id === 'vm1')!.height).toBe(64);
    expect(out.find((n) => n.id === 'vm1')!.width).toBe(200);
  });
});

describe('firewall rule tables', () => {
  it('stay docked to the right of the diagram', () => {
    const a = node('server', 'a');
    a.position = { x: 0, y: 100 };
    const b = node('server', 'b');
    b.position = { x: 900, y: 40 };
    const t = node('fw-table', 't');
    t.position = { x: 0, y: 0 };
    const out = dockTables([a, b, t]);
    const table = out.find((n) => n.id === 't')!;
    expect(table.position).toEqual({ x: 900 + 200 + 64, y: 40 });
    expect(table.draggable).toBe(false);
    expect(dockTables(out)).toBe(out); // stable: no update loop
    const free = { ...t, data: { ...t.data, props: { ...t.data.props, dock: false } } };
    expect(dockTables([a, b, free]).find((n) => n.id === 't')!.position).toEqual({ x: 0, y: 0 });
  });
});
