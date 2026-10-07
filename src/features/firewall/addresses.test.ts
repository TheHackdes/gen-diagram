import { describe, expect, it } from 'vitest';
import { node } from '../../test/helpers';
import type { Vlan } from '../../types';
import { validateDiagram } from '../validation/validate';
import { addressText, referenceFor, remapNodeRefs, resolveAddress } from './addresses';
import { newRule } from './rules';

const VLAN: Vlan = { uid: 'v20', id: 20, name: 'Servers', subnet: '10.0.20.0/24', gateway: '10.0.20.1', color: '#000' };

describe('rule address references', () => {
  it('resolves VLANs and devices to their current subnet and addresses', () => {
    const pve = node('server', 'pve', { ip: '10.0.20.10', ips: [{ address: '10.0.99.10' }] });
    expect(resolveAddress('vlan:v20', [pve], [VLAN])).toMatchObject({ kind: 'vlan', label: 'VLAN 20 · Servers', detail: '10.0.20.0/24' });
    expect(resolveAddress('node:pve', [pve], [VLAN])).toMatchObject({ kind: 'node', label: 'pve', detail: '10.0.20.10, 10.0.99.10' });
    // Renumbering the VLAN is followed.
    expect(resolveAddress('vlan:v20', [], [{ ...VLAN, id: 30, subnet: '10.0.30.0/24' }]).detail).toBe('10.0.30.0/24');
    expect(addressText('10.1.0.0/16', [], [])).toBe('10.1.0.0/16');
    expect(addressText('any', [], [])).toBe('any');
  });

  it('proposes a reference for a literal that matches an object', () => {
    const pve = node('server', 'pve2', { ip: '10.0.20.11' });
    expect(referenceFor('10.0.20.0/24', [pve], [VLAN])?.ref).toBe('vlan:v20');
    expect(referenceFor('10.0.20.11', [pve], [VLAN])?.ref).toBe('node:pve2');
    expect(referenceFor('10.9.9.9', [pve], [VLAN])).toBeNull();
  });

  it('remaps device references of copied rules', () => {
    expect(remapNodeRefs('node:a', new Map([['a', 'b']]))).toBe('node:b');
    expect(remapNodeRefs('vlan:a', new Map([['a', 'b']]))).toBe('vlan:a');
  });

  it('flags references to deleted objects', () => {
    const fw = node('firewall', 'fw', { fwRules: [newRule({ source: 'vlan:gone', destination: 'node:ghost' })] });
    const msgs = validateDiagram([fw], [], [VLAN]).map((i) => i.message);
    expect(msgs.some((m) => /source — refers to a deleted VLAN/.test(m))).toBe(true);
    expect(msgs.some((m) => /destination — refers to a deleted device/.test(m))).toBe(true);
  });
});
