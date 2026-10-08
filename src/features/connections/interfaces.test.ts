import { describe, expect, it } from 'vitest';
import { getDefinition, DEFINITIONS } from '../../data/catalog';
import { useDiagram } from '../../store/diagramStore';
import { edge, node } from '../../test/helpers';
import { interfacesOf } from '../nodes/ips';
import { interfaceVlans, nextPort, suggestConnection } from './suggest';

const host = () => node('server', 'h', { ip: '10.0.20.5', ipLabel: 'eth0', vlan: '20', ips: [{ address: '10.0.30.5', label: 'eth1', vlan: '30' }] });

describe('links mapped to declared interfaces', () => {
  it('lists the interfaces of the address list and the link plugged into each', () => {
    const h = host();
    const list = interfacesOf(h, [edge('l', 'h', 'sw', { sourcePort: 'eth0', targetPort: 'Gi1/0/1' })]);
    expect(list.map((i) => [i.name, i.addresses, i.vlan])).toEqual([
      ['eth0', ['10.0.20.5'], '20'],
      ['eth1', ['10.0.30.5'], '30'],
    ]);
    expect(list[0].link).toEqual({ edgeId: 'l', peer: 'sw', peerPort: 'Gi1/0/1' });
    expect(list[1].link).toBeUndefined();
  });

  it('an address without interface name is on the default interface', () => {
    const h = node('server', 'h2', { ip: '10.0.20.6', vlan: '20' });
    expect(interfacesOf(h, []).map((i) => i.name)).toEqual(['eth0']);
  });

  it('a new link takes the next free declared interface and its VLAN', () => {
    const h = host();
    const sw = node('switch', 'sw');
    const first = edge('l1', 'h', 'sw', { sourcePort: 'eth0' });
    expect(nextPort(h, [first])).toBe('eth1');
    expect(suggestConnection(h, sw, [first])).toMatchObject({ sourcePort: 'eth1', mode: 'access', vlan: '30' });
    // Switches declare SVIs (Vlan20): their links still take physical ports.
    const s = node('switch', 's2', { ip: '10.0.20.2', ipLabel: 'Vlan20', vlan: '20' });
    expect(nextPort(s, [])).not.toBe('Vlan20');
  });

  it('VLAN sub-interfaces ride on their parent: trunk', () => {
    const h = node('server', 'h3', { ip: '10.0.20.7', ipLabel: 'bond0', vlan: '20', ips: [{ address: '10.0.99.7', label: 'bond0.99', vlan: '99' }] });
    expect(interfaceVlans(h, 'bond0')).toEqual(['20', '99']);
    expect(nextPort(h, [])).toBe('bond0');
  });

  it('renaming an interface renames the port of the links plugged into it', () => {
    const h = host();
    const sw = node('switch', 'sw');
    useDiagram.setState({ nodes: [h, sw], edges: [edge('l', 'h', 'sw', { sourcePort: 'eth0', targetPort: 'eth0' })] });
    useDiagram.getState().renameInterface('h', 'eth0', 'ens18');
    const d = useDiagram.getState().edges[0].data!;
    expect([d.sourcePort, d.targetPort]).toEqual(['ens18', 'eth0']); // only this device's side
    // Never onto a port another link already uses.
    useDiagram.setState({ edges: [edge('a', 'h', 'sw', { sourcePort: 'eth0' }), edge('b', 'h', 'sw', { sourcePort: 'eth1' })] });
    useDiagram.getState().renameInterface('h', 'eth0', 'eth1');
    expect(useDiagram.getState().edges[0].data!.sourcePort).toBe('eth0');
  });
});

describe('equipment fields', () => {
  it('equipment with an address list has no separate Network / Gateway fields', () => {
    const offending = DEFINITIONS.filter((d) => d.fields.some((f) => f.key === 'ip') && d.fields.some((f) => f.key === 'network' || f.key === 'gateway'));
    expect(offending.map((d) => d.type)).toEqual([]);
    // Zones keep their subnet and gateway.
    expect(getDefinition('vlan-zone').fields.some((f) => f.key === 'gateway')).toBe(true);
  });
});
