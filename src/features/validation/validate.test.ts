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

  it('a public / virtual IP is shared inside an HA cluster, not across devices', () => {
    const fw1 = node('firewall', 'fw1', { publicIp: '203.0.113.10', redundancyGroup: 'ha' });
    const fw2 = node('firewall', 'fw2', { publicIp: '203.0.113.10', redundancyGroup: 'ha' });
    const other = node('firewall', 'fw3', { publicIp: '203.0.113.10' });
    expect(messages([fw1, fw2], [], []).some((m) => /duplicated/.test(m))).toBe(false);
    expect(messages([fw1, fw2, other], [], []).some((m) => /203\.0\.113\.10 is duplicated/.test(m))).toBe(true);
    // Own addresses stay unique even inside a cluster.
    const a = node('firewall', 'a', { ip: '10.0.0.1', redundancyGroup: 'ha2' });
    const b = node('firewall', 'b', { ip: '10.0.0.1', redundancyGroup: 'ha2' });
    expect(messages([a, b], [], []).some((m) => /10\.0\.0\.1 is duplicated/.test(m))).toBe(true);
  });

  it('access and core switches can be in one stack / MLAG pair', () => {
    const a = node('switch', 'a', { redundancyGroup: 'mlag' });
    const b = node('l3-switch', 'b', { redundancyGroup: 'mlag' });
    const c = node('router', 'c', { redundancyGroup: 'mix' });
    const d = node('switch', 'd', { redundancyGroup: 'mix' });
    const r = messages([a, b, c, d], [], []);
    expect(r.some((m) => /“mlag” mixes/.test(m))).toBe(false);
    expect(r.some((m) => /“mix” mixes/.test(m))).toBe(true);
  });

  it('a catch-all rule only shadows the later rules of the same direction', () => {
    const rule = (direction: string, source = 'any', protocol = 'any') => ({ id: direction + source, action: 'deny', direction, source, destination: 'any', protocol, ports: '', enabled: true });
    const fw = (rules: unknown[]) => node('firewall', 'fw', { fwRules: rules });
    expect(messages([fw([rule('in'), rule('out', '10.0.0.0/8', 'tcp')])], [], []).some((m) => /never used/.test(m))).toBe(false);
    expect(messages([fw([rule('out'), rule('out', '10.0.0.0/8', 'tcp')])], [], []).some((m) => /all outgoing traffic — the 1 out rule after it is never used/.test(m))).toBe(true);
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

describe('every address is checked alike', () => {
  const V99: Vlan = { ...VLAN, uid: 'w', id: 99, name: 'Mgmt', subnet: '192.168.99.0/24', gateway: '192.168.99.1' };
  it('a second address in the wrong subnet or on a broadcast address is reported', () => {
    const n = node('server', 'm', { ip: '192.168.20.10', vlan: '20', ips: [{ address: '192.168.99.255', vlan: '99' }, { address: '10.0.0.1', vlan: '20' }] });
    const r = messages([n], [], [VLAN, V99]);
    expect(r.some((m) => /192\.168\.99\.255 is the broadcast address/.test(m))).toBe(true);
    expect(r.some((m) => /10\.0\.0\.1 is outside VLAN 20/.test(m))).toBe(true);
  });
  it('the gateway of a server comes from the VLANs of its addresses', () => {
    // VLAN 20 defines a gateway: nothing to report, even with a second address elsewhere.
    const ok = node('server', 'g', { ip: '192.168.20.10', vlan: '20', ips: [{ address: '192.168.99.10', vlan: '99' }] });
    expect(messages([ok], [], [VLAN, V99]).some((m) => /gateway/.test(m))).toBe(false);
    const none = node('server', 'g2', { ip: '192.168.99.11', vlan: '99' });
    expect(messages([none], [], [{ ...V99, gateway: undefined }])).toContain('info: g2 has no gateway: VLAN 99 defines none');
    const loose = node('server', 'g3', { ip: '10.0.0.5' });
    expect(messages([loose], [], [])).toContain('info: g3 has no gateway: put its address in a VLAN that defines one');
    // The old per-device fields are no longer checked.
    const legacy = node('server', 'g4', { ip: '192.168.20.12', vlan: '20', gateway: '10.9.9.1', network: '10.0.0.0/8' });
    expect(messages([legacy], [], [VLAN]).some((m) => /gateway|in its network/.test(m))).toBe(false);
  });
});

describe('multi-VLAN devices', () => {
  const V30: Vlan = { ...VLAN, uid: 'x', id: 30, name: 'Users', subnet: '192.168.30.0/24', gateway: '192.168.30.1' };
  it('a DHCP server serves every VLAN where it has an address', () => {
    const r1 = node('router', 'r1', { ip: '192.168.20.1', vlan: '20', services: ['dhcp'], ips: [{ address: '192.168.30.1', vlan: '30' }] });
    const r2 = node('server', 'd2', { ip: '192.168.30.5', vlan: '30', services: ['dhcp'] });
    expect(messages([r1, r2], [], [VLAN, V30]).some((m) => /VLAN 30 has 2 DHCP servers/.test(m))).toBe(true);
  });
  it('trunks may only carry defined VLANs', () => {
    const edges = [edge('t', 'sA', 'sB', { mode: 'trunk', vlan: '20,77' })];
    expect(messages([node('switch', 'sA'), node('switch', 'sB')], edges, [VLAN]).some((m) => /undefined VLAN 77/.test(m))).toBe(true);
  });
});
