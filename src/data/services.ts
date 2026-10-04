import type { NodeRole } from '../types';

/**
 * Network services an equipment can provide in addition to its main role
 * (a router that is also a DHCP and DNS server, a NAS that runs backups…).
 * Add an entry here to make it available everywhere.
 */
export interface ServiceInfo {
  id: string;
  label: string;
  short: string;
  icon: string;
  color: string;
}

export const SERVICES: ServiceInfo[] = [
  { id: 'dhcp', label: 'DHCP server', short: 'DHCP', icon: 'dhcp', color: '#0891b2' },
  { id: 'dns', label: 'DNS server', short: 'DNS', icon: 'dns', color: '#7c3aed' },
  { id: 'nat', label: 'NAT / PAT', short: 'NAT', icon: 'reverse-proxy', color: '#2563eb' },
  { id: 'ntp', label: 'NTP server', short: 'NTP', icon: 'clock', color: '#64748b' },
  { id: 'routing', label: 'Routing (OSPF/BGP)', short: 'Route', icon: 'router', color: '#2563eb' },
  { id: 'proxy', label: 'Proxy / reverse proxy', short: 'Proxy', icon: 'reverse-proxy', color: '#db2777' },
  { id: 'lb', label: 'Load balancer', short: 'LB', icon: 'load-balancer', color: '#2563eb' },
  { id: 'web', label: 'Web server', short: 'Web', icon: 'web', color: '#ea580c' },
  { id: 'db', label: 'Database', short: 'DB', icon: 'database', color: '#d97706' },
  { id: 'ldap', label: 'Directory (AD / LDAP)', short: 'AD', icon: 'auth', color: '#0d9488' },
  { id: 'radius', label: 'RADIUS / 802.1X', short: 'RADIUS', icon: 'auth', color: '#0d9488' },
  { id: 'mail', label: 'Mail server', short: 'Mail', icon: 'mail', color: '#0284c7' },
  { id: 'files', label: 'File sharing (SMB / NFS)', short: 'Files', icon: 'nas', color: '#0891b2' },
  { id: 'print', label: 'Print server', short: 'Print', icon: 'printer', color: '#64748b' },
  { id: 'backup', label: 'Backup', short: 'Backup', icon: 'san', color: '#059669' },
  { id: 'monitoring', label: 'Monitoring', short: 'Monit', icon: 'monitoring', color: '#ca8a04' },
  { id: 'syslog', label: 'Log collector (syslog)', short: 'Logs', icon: 'text', color: '#64748b' },
  { id: 'pxe', label: 'PXE / TFTP boot', short: 'PXE', icon: 'device', color: '#64748b' },
];

export const SERVICE_BY_ID = new Map(SERVICES.map((s) => [s.id, s]));

/** Services typically combined with a role — offered first in the properties panel. */
export const SUGGESTED_SERVICES: Partial<Record<NodeRole, string[]>> = {
  router: ['dhcp', 'dns', 'nat', 'ntp', 'routing'],
  firewall: ['nat', 'dhcp', 'dns', 'routing', 'proxy'],
  'core-switch': ['routing', 'dhcp', 'ntp'],
  server: ['dns', 'dhcp', 'web', 'db', 'ldap', 'files'],
  vm: ['web', 'db', 'dns', 'ldap'],
  lxc: ['dns', 'web', 'monitoring', 'proxy'],
  storage: ['files', 'backup'],
  security: ['proxy', 'radius', 'ldap'],
  hypervisor: ['backup', 'monitoring'],
};

export function servicesOf(props: Record<string, unknown>): string[] {
  return Array.isArray(props.services) ? props.services.filter((s): s is string => typeof s === 'string' && SERVICE_BY_ID.has(s)) : [];
}
