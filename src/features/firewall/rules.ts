import { getDefinition } from '../../data/catalog';
import type { FirewallRule, InfraNode, RuleAction, RuleDirection, RuleProtocol } from '../../types';
import { isValidCidr, isValidIPv4 } from '../../utils/ip';
import { str, uid } from '../../utils/misc';

export const PROTOCOLS: RuleProtocol[] = ['tcp', 'udp', 'tcp/udp', 'icmp', 'any'];

export function newRule(partial: Partial<FirewallRule> = {}): FirewallRule {
  return {
    id: uid('r_'),
    action: 'allow',
    direction: 'in',
    source: 'any',
    destination: 'any',
    protocol: 'tcp',
    ports: '',
    comment: '',
    enabled: true,
    ...partial,
  };
}

/** One-click rule presets. */
export const RULE_PRESETS: { label: string; rule: Partial<FirewallRule> }[] = [
  { label: 'SSH', rule: { protocol: 'tcp', ports: '22', comment: 'SSH' } },
  { label: 'HTTP/S', rule: { protocol: 'tcp', ports: '80,443', comment: 'Web' } },
  { label: 'RDP', rule: { protocol: 'tcp', ports: '3389', comment: 'Remote desktop' } },
  { label: 'DNS', rule: { protocol: 'tcp/udp', ports: '53', comment: 'DNS' } },
  { label: 'Ping', rule: { protocol: 'icmp', comment: 'ICMP echo' } },
  { label: 'Deny all', rule: { action: 'deny', protocol: 'any', comment: 'Default deny' } },
];

const ACTIONS = new Set(['allow', 'deny']);
const DIRECTIONS = new Set(['in', 'out', 'forward']);

/**
 * Rules of a node. Also migrates the v1.1 free-text format
 * ("allow tcp/22 from 192.168.10.0/24", one rule per line).
 */
export function rulesOf(props: Record<string, unknown>): FirewallRule[] {
  const raw = props.fwRules;
  if (Array.isArray(raw)) {
    return raw
      .filter((r): r is FirewallRule => !!r && typeof r === 'object')
      .map((r) =>
        newRule({
          ...r,
          id: str(r.id) || uid('r_'),
          action: (ACTIONS.has(r.action) ? r.action : 'allow') as RuleAction,
          direction: (DIRECTIONS.has(r.direction) ? r.direction : 'in') as RuleDirection,
          enabled: r.enabled !== false,
        }),
      );
  }
  if (typeof raw === 'string') {
    return raw
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const m = line.match(/^(allow|deny)\s+(tcp|udp|icmp|any)(?:\/([\d,:-]+))?(?:\s+from\s+(\S+))?(?:\s+to\s+(\S+))?/i);
        if (!m) return newRule({ protocol: 'any', comment: line });
        return newRule({
          action: m[1].toLowerCase() as RuleAction,
          protocol: m[2].toLowerCase() as RuleProtocol,
          ports: m[3] ?? '',
          source: m[4] ?? 'any',
          destination: m[5] ?? 'any',
        });
      });
  }
  return [];
}

/** Nodes carrying rules: firewall appliances and machines with a host firewall. */
export function hasRules(node: InfraNode): boolean {
  return getDefinition(node.data.type).role === 'firewall' || node.data.props.fw === true;
}

export function isValidPorts(ports: string): boolean {
  if (!ports.trim()) return true;
  return ports.split(',').every((p) => {
    const m = p.trim().match(/^(\d{1,5})(?:[-:](\d{1,5}))?$/);
    if (!m) return false;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    return a >= 1 && b <= 65535 && a <= b;
  });
}

/** A source/destination is valid when it is "any", an IP/CIDR or a name/alias. */
export function addressProblem(value: string): string | null {
  const v = value.trim();
  if (!v) return 'Required';
  if (/^[\d.]+(\/\d+)?$/.test(v) && !isValidIPv4(v) && !isValidCidr(v)) return 'Invalid IP / CIDR';
  return null;
}

export function formatPorts(rule: FirewallRule): string {
  if (rule.protocol === 'icmp' || rule.protocol === 'any') return '—';
  return rule.ports.trim() || 'all';
}
