import { describe, expect, it } from 'vitest';
import { node } from '../../test/helpers';
import { suggestConnection } from './suggest';

describe('connection suggestions', () => {
  it('server → switch: Ethernet, access port in the server VLAN', () => {
    const d = suggestConnection(node('server', 's', { vlan: '20' }), node('switch', 'w'), []);
    expect(d).toMatchObject({ connType: 'ethernet', sourcePort: 'eth0', targetPort: 'Gi1/0/1', speed: '1 Gbps', mode: 'access', vlan: '20' });
  });

  it('a VPN gateway uplink to the Internet is a WAN link, not a tunnel', () => {
    expect(suggestConnection(node('vpn-gateway', 'g'), node('internet', 'i'), []).connType).toBe('wan');
  });

  it('two VPN-capable devices are linked by a tunnel on virtual interfaces', () => {
    const a = node('router', 'r1', { vpn: true, vpnProtocol: 'WireGuard' });
    const b = node('firewall', 'f1', { vpn: true, vpnProtocol: 'WireGuard' });
    expect(suggestConnection(a, b, [])).toMatchObject({ connType: 'vpn', sourcePort: 'wg0', targetPort: 'wg0', label: 'WireGuard' });
  });

  it('VPN-capable firewall to a cloud: site-to-site tunnel', () => {
    expect(suggestConnection(node('firewall', 'f2', { vpn: true }), node('aws', 'a'), []).connType).toBe('vpn');
  });

  it('Wi-Fi does not consume Ethernet ports', () => {
    const router = node('router', 'r2', { wifi: true, ssid: 'Corp, Guest' });
    expect(suggestConnection(router, node('laptop', 'l'), [])).toMatchObject({ connType: 'wifi', sourcePort: 'Corp', targetPort: 'wlan0' });
  });

  it('switch ↔ switch: fiber trunk', () => {
    expect(suggestConnection(node('switch', 'a1'), node('l3-switch', 'b1'), [])).toMatchObject({ connType: 'fiber', mode: 'trunk', speed: '10 Gbps' });
  });
});

describe('multi-homed hosts', () => {
  const host = () =>
    node('server', 'mh', { ip: '10.0.20.5', ipLabel: 'eth0', vlan: '20', ips: [{ address: '10.0.99.5', label: 'eth1', vlan: '99' }] });
  it('each NIC gets an access port in the VLAN of its address', () => {
    const h = host();
    const sw = node('switch', 'swm');
    const first = suggestConnection(h, sw, []);
    expect(first).toMatchObject({ sourcePort: 'eth0', mode: 'access', vlan: '20' });
    const second = suggestConnection(h, sw, [{ id: 'x', type: 'network', source: h.id, target: sw.id, data: first }]);
    expect(second).toMatchObject({ sourcePort: 'eth1', mode: 'access', vlan: '99' });
  });
  it('several networks on an interface without address: trunk', () => {
    const h = node('server', 'mh2', { ip: '10.0.20.6', ipLabel: 'bond0', vlan: '20', ips: [{ address: '10.0.99.6', label: 'bond0.99', vlan: '99' }] });
    expect(suggestConnection(h, node('switch', 'sw2'), [])).toMatchObject({ mode: 'trunk', vlan: '20,99' });
  });
});
