import { describe, expect, it } from 'vitest';
import { node } from '../../test/helpers';
import { addressEntries, allIps, defaultInterface, entriesPatch } from './ips';

describe('address list', () => {
  it('reads the stored addresses as one uniform list', () => {
    const props = { ip: '10.0.20.5', ipLabel: 'eth0', vlan: '20', ips: [{ address: '10.0.99.5', label: 'mgmt', vlan: '99', show: false }] };
    expect(addressEntries(props)).toEqual([
      { address: '10.0.20.5', label: 'eth0', vlan: '20', show: true },
      { address: '10.0.99.5', label: 'mgmt', vlan: '99', show: false },
    ]);
  });

  it('round-trips through storage; the first entry feeds ip / vlan used elsewhere', () => {
    const entries = [
      { address: '10.0.99.5', label: 'mgmt', vlan: '99', show: false },
      { address: '10.0.20.5', label: 'eth0', vlan: '20', show: true },
    ];
    const patch = entriesPatch(entries);
    expect(patch).toMatchObject({ ip: '10.0.99.5', ipLabel: 'mgmt', vlan: '99', ipHidden: true });
    expect(addressEntries(patch)).toEqual(entries);
    expect(allIps(patch).map((e) => e.address)).toEqual(['10.0.99.5', '10.0.20.5']);
  });

  it('a line without address keeps its interface and VLAN; removing all clears them', () => {
    expect(addressEntries(entriesPatch([{ address: '', label: 'eth0', vlan: '20', show: true }]))).toHaveLength(1);
    expect(entriesPatch([])).toMatchObject({ ip: '', vlan: '', ips: [] });
  });

  it('suggests interface names by device kind', () => {
    expect(defaultInterface(node('lxc', 'c'), 0, '20')).toBe('eth0');
    expect(defaultInterface(node('vm', 'v'), 1, '')).toBe('net1');
    expect(defaultInterface(node('switch', 's'), 0, '99')).toBe('Vlan99');
  });
});
