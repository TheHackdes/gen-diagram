import type { ComponentDefinition } from '../../types';
import { F, SERVER_FIELDS } from './fields';
import { device, ethPorts } from './helpers';

const serverPorts = ethPorts('eth', 0);

function server(
  type: string,
  label: string,
  icon: string,
  description: string,
  extra: Partial<ComponentDefinition> = {},
): ComponentDefinition {
  return device({
    type,
    label,
    category: 'servers',
    role: 'server',
    icon,
    description,
    fields: SERVER_FIELDS,
    portPattern: serverPorts,
    ...extra,
  });
}

const STORAGE_FIELDS = [
  F.hostname,
  F.ip,
  { key: 'capacity', label: 'Capacity', type: 'text' as const, placeholder: '48 TB raw' },
  { key: 'protocols', label: 'Protocols', type: 'text' as const, placeholder: 'NFS, SMB, iSCSI' },
  F.vlan,
  F.description,
  F.mac,
  F.vendor,
  F.model,
  F.serial,
  F.location,
];

export const SERVERS: ComponentDefinition[] = [
  server('server', 'Physical Server', 'server', 'Bare-metal server.', { keywords: ['host', 'baremetal', 'machine'] }),
  server('rack-server', 'Rack Server', 'rack-server', 'Rack-mounted server (1U/2U).', { keywords: ['dell', 'hpe', 'poweredge', 'proliant'] }),
  server('blade-server', 'Blade Server', 'blade', 'Blade in a chassis.', { keywords: ['chassis', 'ucs'] }),
  server('database-server', 'Database Server', 'database', 'Relational or NoSQL database server.', {
    keywords: ['sql', 'postgres', 'mysql', 'mariadb', 'oracle', 'mssql', 'db'],
    defaults: { role: 'Database Server' },
  }),
  server('web-server', 'Web Server', 'web', 'HTTP server (nginx, Apache, IIS).', {
    keywords: ['nginx', 'apache', 'iis', 'http'],
    defaults: { role: 'Web Server' },
  }),
  server('app-server', 'Application Server', 'app', 'Runs business applications / APIs.', {
    keywords: ['backend', 'api', 'tomcat', 'java'],
    defaults: { role: 'Application Server' },
  }),
  server('dns-server', 'DNS Server', 'dns', 'Name resolution (BIND, Unbound, AD DNS).', {
    keywords: ['bind', 'unbound', 'resolver', 'pihole'],
    defaults: { role: 'DNS Server' },
  }),
  server('dhcp-server', 'DHCP Server', 'dhcp', 'Dynamic address assignment.', {
    keywords: ['kea', 'isc', 'lease'],
    defaults: { role: 'DHCP Server' },
  }),
  device({
    type: 'nas',
    label: 'NAS',
    category: 'servers',
    role: 'storage',
    icon: 'nas',
    color: '#0891b2',
    description: 'Network attached storage (file level).',
    keywords: ['synology', 'truenas', 'qnap', 'nfs', 'smb', 'storage'],
    fields: STORAGE_FIELDS,
    portPattern: serverPorts,
  }),
  device({
    type: 'san',
    label: 'SAN',
    category: 'servers',
    role: 'storage',
    icon: 'san',
    color: '#0891b2',
    description: 'Storage area network array (block level).',
    keywords: ['iscsi', 'fc', 'fibre channel', 'array', 'storage'],
    fields: STORAGE_FIELDS,
    portPattern: ethPorts('fc', 0),
  }),
  device({
    type: 'storage',
    label: 'Storage',
    category: 'servers',
    role: 'storage',
    icon: 'storage',
    color: '#0891b2',
    description: 'Generic storage / datastore / pool.',
    keywords: ['ceph', 'zfs', 'datastore', 'pool', 'disk', 'backup'],
    fields: [
      { key: 'storageType', label: 'Type', type: 'select', options: ['ZFS', 'LVM-thin', 'Ceph', 'NFS', 'iSCSI', 'Directory', 'VMFS', 'S3'].map((v) => ({ value: v, label: v })) },
      { key: 'capacity', label: 'Capacity', type: 'text', placeholder: '4 TB' },
      F.description,
    ],
    standalone: true,
  }),
];
