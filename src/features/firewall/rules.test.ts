import { describe, expect, it } from 'vitest';
import { describeRule, insertRule, isValidPorts, newRule, rulesOf } from './rules';

describe('firewall rules', () => {
  it('new rules go before a final deny-all', () => {
    const deny = newRule({ action: 'deny', protocol: 'any' });
    const ssh = newRule({ ports: '22' });
    expect(insertRule([deny], ssh).map((r) => r.id)).toEqual([ssh.id, deny.id]);
    const deny2 = newRule({ action: 'deny', protocol: 'any' });
    expect(insertRule([deny], deny2).map((r) => r.id)).toEqual([deny.id, deny2.id]);
  });

  it('reads as a sentence', () => {
    expect(describeRule(newRule({ ports: '80,443', destination: '10.0.0.5' }))).toEqual({ head: 'Allow TCP 80,443', flow: 'In · any → 10.0.0.5' });
    expect(describeRule(newRule({ action: 'deny', protocol: 'icmp', direction: 'forward' })).head).toBe('Deny ICMP');
  });

  it('validates ports and migrates v1.1 text rules', () => {
    expect(isValidPorts('22')).toBe(true);
    expect(isValidPorts('8000-8100, 443')).toBe(true);
    expect(isValidPorts('70000')).toBe(false);
    const [r] = rulesOf({ fwRules: 'allow tcp/22 from 192.168.10.0/24' });
    expect(r).toMatchObject({ action: 'allow', protocol: 'tcp', ports: '22', source: '192.168.10.0/24' });
  });
});
