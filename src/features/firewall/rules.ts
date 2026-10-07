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
  { label: 'Deny all', rule: { action: 'deny', protocol: 'any', source: 'any', destination: 'any', comment: 'Default deny' } },
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
  // References to VLANs / devices are checked against the diagram (validation).
  if (v.startsWith('vlan:') || v.startsWith('node:')) return null;
  if (/^[\d.]+(\/\d+)?$/.test(v) && !isValidIPv4(v) && !isValidCidr(v)) return 'Invalid IP / CIDR';
  return null;
}

export function formatPorts(rule: FirewallRule): string {
  if (rule.protocol === 'icmp' || rule.protocol === 'any') return '—';
  return rule.ports.trim() || 'all';
}

/** Ports commonly used in rules (shown as suggestions). */
export const COMMON_PORTS: { value: string; label: string }[] = [
  { value: '22', label: 'SSH' },
  { value: '80,443', label: 'HTTP / HTTPS' },
  { value: '443', label: 'HTTPS' },
  { value: '53', label: 'DNS' },
  { value: '3389', label: 'RDP' },
  { value: '25,465,587', label: 'SMTP' },
  { value: '389,636', label: 'LDAP / LDAPS' },
  { value: '445', label: 'SMB' },
  { value: '2049', label: 'NFS' },
  { value: '3306', label: 'MySQL / MariaDB' },
  { value: '5432', label: 'PostgreSQL' },
  { value: '51820', label: 'WireGuard' },
  { value: '500,4500', label: 'IPsec' },
  { value: '161', label: 'SNMP' },
  { value: '8006', label: 'Proxmox UI' },
];

const DIRECTION_LABEL: Record<string, string> = { in: 'In', out: 'Out', forward: 'Fwd' };

/** One-line reading of a rule: "Allow TCP 443 · any → 10.0.0.5". */
export function describeRule(r: FirewallRule, name: (value: string) => string = (v) => v): { head: string; flow: string } {
  const proto = r.protocol === 'any' ? 'any protocol' : r.protocol.toUpperCase();
  const ports = r.protocol === 'icmp' || r.protocol === 'any' ? '' : ` ${r.ports.trim() || 'all ports'}`;
  return {
    head: `${r.action === 'allow' ? 'Allow' : 'Deny'} ${proto}${ports}`,
    flow: `${DIRECTION_LABEL[r.direction]} · ${name(r.source) || '?'} → ${name(r.destination) || '?'}`,
  };
}

const isCatchAllDeny = (r: FirewallRule | undefined) =>
  !!r && r.action === 'deny' && r.source.trim() === 'any' && r.destination.trim() === 'any' && r.protocol === 'any';

/** Add a rule; a final "deny everything" stays last so the new rule is reachable. */
export function insertRule(rules: FirewallRule[], rule: FirewallRule): FirewallRule[] {
  const last = rules[rules.length - 1];
  return isCatchAllDeny(last) && !isCatchAllDeny(rule) ? [...rules.slice(0, -1), rule, last!] : [...rules, rule];
}
