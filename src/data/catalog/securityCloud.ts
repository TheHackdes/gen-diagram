import type { ComponentDefinition } from '../../types';
import { F, SECURITY_FIELDS, SERVER_FIELDS } from './fields';
import { device, ethPorts } from './helpers';

function security(type: string, label: string, icon: string, description: string, keywords: string[], extra: Partial<ComponentDefinition> = {}) {
  return device({
    type,
    label,
    category: 'security',
    role: 'security',
    icon,
    color: '#dc2626',
    description,
    keywords,
    fields: SECURITY_FIELDS,
    portPattern: ethPorts('eth', 0),
    ...extra,
  });
}

export const SECURITY: ComponentDefinition[] = [
  security('sec-firewall', 'Firewall', 'firewall', 'Stateful firewall / NGFW.', ['ngfw', 'opnsense', 'pfsense', 'fortigate'], {
    role: 'firewall',
    fields: [F.mgmtIp, F.publicIp, ...SECURITY_FIELDS.filter((f) => f.key !== 'ip')],
    portPattern: ethPorts('port', 1),
  }),
  security('ids', 'IDS', 'ids', 'Intrusion detection system.', ['suricata', 'snort', 'zeek', 'detection']),
  security('ips', 'IPS', 'ips', 'Intrusion prevention system.', ['suricata', 'prevention']),
  security('waf', 'WAF', 'waf', 'Web application firewall.', ['modsecurity', 'cloudflare', 'owasp']),
  security('reverse-proxy', 'Reverse Proxy', 'reverse-proxy', 'Terminates TLS and routes HTTP traffic.', ['nginx', 'traefik', 'haproxy', 'caddy', 'proxy'], {
    fields: SERVER_FIELDS,
    defaults: { role: 'Reverse Proxy' },
  }),
  security('vpn-server', 'VPN', 'vpn', 'VPN server for remote access.', ['wireguard', 'openvpn', 'ipsec', 'remote access'], {
    role: 'vpn',
    color: '#059669',
  }),
  security('bastion', 'Bastion', 'bastion', 'Hardened jump host for administration.', ['jump host', 'ssh', 'teleport', 'guacamole'], {
    fields: SERVER_FIELDS,
    defaults: { role: 'Bastion host' },
  }),
  security('auth-server', 'Authentication Server', 'auth', 'Identity provider (AD, LDAP, RADIUS, SSO).', ['ldap', 'radius', 'active directory', 'keycloak', 'sso', 'idp'], {
    fields: SERVER_FIELDS,
    defaults: { role: 'Authentication' },
  }),
];

const CLOUD_FIELDS = [
  { key: 'region', label: 'Region', type: 'text' as const, placeholder: 'eu-west-3' },
  { key: 'account', label: 'Account / subscription', type: 'text' as const },
  { key: 'vpc', label: 'VPC / VNet CIDR', type: 'cidr' as const, placeholder: '10.100.0.0/16' },
  F.description,
];

function cloud(type: string, label: string, icon: string, color: string, description: string, keywords: string[]) {
  return device({
    type,
    label,
    category: 'cloud',
    role: 'cloud',
    icon,
    color,
    description,
    keywords,
    fields: CLOUD_FIELDS,
    standalone: true,
  });
}

export const CLOUD: ComponentDefinition[] = [
  cloud('aws', 'AWS', 'brand:aws', '#FF9900', 'Amazon Web Services.', ['amazon', 'ec2', 'vpc', 's3']),
  cloud('azure', 'Azure', 'brand:azure', '#0078D4', 'Microsoft Azure.', ['microsoft', 'vnet', 'entra']),
  cloud('gcp', 'Google Cloud', 'brand:gcp', '#4285F4', 'Google Cloud Platform.', ['gcp', 'gce', 'google']),
  cloud('cloudflare', 'Cloudflare', 'brand:cloudflare', '#F38020', 'CDN, DNS, Zero Trust.', ['cdn', 'tunnel', 'zero trust', 'dns']),
  cloud('cloud', 'Generic Cloud', 'cloud', '#0284c7', 'Any public or private cloud.', ['saas', 'iaas', 'private cloud']),
];
