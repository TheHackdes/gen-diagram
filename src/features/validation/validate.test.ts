import { describe, expect, it } from 'vitest';
import { TEMPLATES } from '../../data/templates';
import { edge, node } from '../../test/helpers';
import type { Vlan } from '../../types';
import { autoLayout } from '../layout/autoLayout';
import { nodeSize } from '../nodes/hierarchy';
import { validateDiagram } from './validate';

const VLAN: Vlan = { uid: 'v', id: 20, name: 'Servers', subnet: '192.168.20.0/24', gateway: '192.168.20.1', color: '#000' };
const messages = (...args: Parameters<typeof validateDiagram>) => validateDiagram(...args).map((i) => `${i.severity}: ${i.message}`);

describe('validation rules', () => {
  it('flags network and broadcast addresses', () => {
    const r = messages([node('server', 'a', { ip: '192.168.20.0', vlan: '20' }), node('server', 'b', { ip: '192.168.20.255', vlan: '20' })], [], [VLAN]);
    expect(r.some((m) => /network address/.test(m))).toBe(true);
    expect(r.some((m) => /broadcast address/.test(m))).toBe(true);
  });

  it('flags duplicate IPs including additional addresses', () => {
    const r = messages([node('server', 'a', { ip: '10.0.0.1' }), node('server', 'b', { ips: [{ address: '10.0.0.1' }] })], [], []);
    expect(r.some((m) => /10\.0\.0\.1 is duplicated/.test(m))).toBe(true);
  });

  it('a tunnel interface can serve several peers', () => {
    const hub = node('firewall', 'hub', { vpn: true });
    const s1 = node('router', 's1', { vpn: true });
    const s2 = node('router', 's2', { vpn: true });
    const edges = [edge('a', 'hub', 's1', { connType: 'vpn', sourcePort: 'wg0' }), edge('b', 'hub', 's2', { connType: 'vpn', sourcePort: 'wg0' })];
    expect(messages([hub, s1, s2], edges, []).some((m) => /Port wg0/.test(m))).toBe(false);
  });

  it('a physical port cannot carry two cables', () => {
    const edges = [edge('a', 'x', 'y', { sourcePort: 'eth0' }), edge('b', 'x', 'z', { sourcePort: 'eth0' })];
    expect(messages([node('server', 'x'), node('switch', 'y'), node('switch', 'z')], edges, []).some((m) => /Port eth0 of x/.test(m))).toBe(true);
  });

  it('unbonded parallel links: loop warning between switches, info towards a host', () => {
    const sw = [edge('a', 's1', 's2'), edge('b', 's1', 's2')];
    expect(messages([node('switch', 's1'), node('switch', 's2')], sw, []).some((m) => /^warning: .*switching loop/.test(m))).toBe(true);
    const host = [edge('c', 'h', 's1'), edge('d', 'h', 's1')];
    expect(messages([node('server', 'h'), node('switch', 's1')], host, []).some((m) => /^info: .*not grouped/.test(m))).toBe(true);
  });

  it('bond problems surface in the issues list', () => {
    const edges = [edge('a', 'h', 'sA', { bondId: 'b' }), edge('b', 'h', 'sB', { bondId: 'b' })];
    const r = messages([node('server', 'h'), node('switch', 'sA'), node('switch', 'sB')], edges, [], [{ id: 'b', name: 'bond0', mode: 'lacp' }]);
    expect(r.some((m) => /^error: bond0: LACP towards sA \+ sB/.test(m))).toBe(true);
  });
});

describe('templates', () => {
  for (const t of TEMPLATES) {
    it(`“${t.name}” has no validation error or warning`, () => {
      const c = t.build();
      const problems = validateDiagram(c.nodes, c.edges, c.vlans, c.bonds).filter((i) => i.severity !== 'info');
      expect(problems.map((p) => p.message)).toEqual([]);
    });
    it(`“${t.name}” lays out without overlapping top-level elements`, () => {
      const c = t.build();
      for (const algo of ['network', 'hierarchical', 'tree', 'force', 'grid'] as const) {
        const top = autoLayout(c.nodes, c.edges, algo).filter((n) => !n.parentId);
        for (const a of top)
          for (const b of top) {
            if (a === b) continue;
            const sa = nodeSize(a);
            const sb = nodeSize(b);
            const overlap = a.position.x < b.position.x + sb.width && b.position.x < a.position.x + sa.width && a.position.y < b.position.y + sb.height && b.position.y < a.position.y + sa.height;
            expect(overlap, `${algo}: ${a.data.name} overlaps ${b.data.name}`).toBe(false);
          }
      }
    });
  }
});

describe('subnet overlaps', () => {
  it('flags overlapping VLAN subnets and tunnel networks', () => {
    const vlans: Vlan[] = [VLAN, { ...VLAN, uid: 'w', id: 30, subnet: '192.168.0.0/16' }];
    expect(messages([], [], vlans).some((m) => /overlapping subnets/.test(m))).toBe(true);
    const fw = node('firewall', 'fw', { vpn: true, vpnNetwork: '192.168.20.128/25' });
    expect(messages([fw], [], [VLAN]).some((m) => /tunnel network .* overlaps VLAN 20/.test(m))).toBe(true);
  });
});

describe('containment rules', () => {
  it('a Docker network holds containers only; hypervisors host guests', async () => {
    const { canContain } = await import('../../data/catalog');
    expect(canContain('docker-network', 'docker-container')).toBe(true);
    expect(canContain('docker-network', 'server')).toBe(false);
    expect(canContain('proxmox', 'lxc')).toBe(true);
    expect(canContain('esxi', 'lxc')).toBe(false);
    expect(canContain('vlan-zone', 'proxmox')).toBe(true);
  });
});
