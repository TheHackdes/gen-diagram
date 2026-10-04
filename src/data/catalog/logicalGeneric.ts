import type { ComponentDefinition } from '../../types';
import { ENDPOINT_FIELDS, F } from './fields';
import { device, ethPorts, zone } from './helpers';

const ZONE_SIZE = { width: 520, height: 300 };

const ZONE_FIELDS = [
  F.vlan,
  { key: 'subnet', label: 'Subnet', type: 'cidr' as const, placeholder: '192.168.20.0/24' },
  F.gateway,
  F.description,
  { key: 'dhcpRange', label: 'DHCP range', type: 'text' as const, placeholder: '192.168.20.100-200', advanced: true, mono: true },
  { ...F.dns, advanced: true },
];

export const LOGICAL: ComponentDefinition[] = [
  zone({
    type: 'vlan-zone',
    label: 'VLAN',
    category: 'logical',
    icon: 'vlan',
    color: '#059669',
    description: 'Area grouping the equipment of a VLAN. Bind it to a VLAN definition.',
    keywords: ['802.1q', 'tag', 'segment', 'broadcast domain'],
    fields: ZONE_FIELDS,
    size: ZONE_SIZE,
  }),
  zone({
    type: 'subnet',
    label: 'Subnet',
    category: 'logical',
    icon: 'subnet',
    color: '#0891b2',
    description: 'IP subnet area (CIDR).',
    keywords: ['cidr', 'ip range', 'prefix'],
    fields: ZONE_FIELDS,
    size: ZONE_SIZE,
  }),
  zone({
    type: 'network-zone',
    label: 'Network',
    category: 'logical',
    icon: 'network',
    color: '#2563eb',
    description: 'Logical network area (Production, Lab…).',
    keywords: ['zone', 'segment', 'production', 'environment'],
    fields: ZONE_FIELDS,
    size: ZONE_SIZE,
  }),
  zone({
    type: 'dmz',
    label: 'DMZ',
    category: 'logical',
    icon: 'dmz',
    color: '#dc2626',
    description: 'Demilitarized zone exposed to the Internet.',
    keywords: ['perimeter', 'exposed', 'public services'],
    fields: ZONE_FIELDS,
    size: ZONE_SIZE,
  }),
  zone({
    type: 'site',
    label: 'Site / Location',
    category: 'logical',
    icon: 'building',
    color: '#475569',
    description: 'Physical site, building or datacenter.',
    keywords: ['datacenter', 'office', 'building', 'campus', 'branch'],
    fields: [{ key: 'address', label: 'Address', type: 'text' }, F.description],
    size: { width: 640, height: 400 },
  }),
];

function endpoint(type: string, label: string, icon: string, description: string, keywords: string[], extra: Partial<ComponentDefinition> = {}) {
  return device({
    type,
    label,
    category: 'generic',
    role: 'endpoint',
    icon,
    description,
    keywords,
    fields: ENDPOINT_FIELDS,
    portPattern: ethPorts('eth', 0),
    ...extra,
  });
}

export const GENERIC: ComponentDefinition[] = [
  endpoint('pc', 'PC', 'pc', 'Desktop workstation.', ['workstation', 'desktop', 'computer']),
  endpoint('laptop', 'Laptop', 'laptop', 'Portable workstation.', ['notebook', 'computer']),
  endpoint('printer', 'Printer', 'printer', 'Network printer / MFP.', ['mfp', 'print']),
  endpoint('phone', 'IP Phone', 'phone', 'VoIP phone.', ['voip', 'sip', 'telephony']),
  endpoint('smartphone', 'Smartphone', 'smartphone', 'Mobile device.', ['mobile', 'tablet', 'byod']),
  endpoint('iot', 'IoT Device', 'iot', 'Sensor, smart device or OT equipment.', ['sensor', 'smart', 'ot', 'scada']),
  endpoint('camera', 'IP Camera', 'camera', 'Video surveillance camera.', ['cctv', 'nvr', 'video']),
  endpoint('device', 'Generic Device', 'device', 'Any other network device.', ['other', 'appliance']),
  endpoint('user', 'User', 'user', 'A person / actor.', ['person', 'actor', 'admin', 'client'], {
    fields: [{ key: 'role', label: 'Role', type: 'text', placeholder: 'Administrator' }, F.description],
    standalone: true,
    portPattern: undefined,
  }),
  endpoint('users', 'User Group', 'users', 'A group of people.', ['team', 'department', 'customers'], {
    fields: [{ key: 'count', label: 'Number of users', type: 'number' }, F.description],
    standalone: true,
    portPattern: undefined,
  }),
  zone({
    type: 'group',
    label: 'Group',
    category: 'generic',
    role: 'group',
    icon: 'group',
    color: '#64748b',
    description: 'Free-form group of elements (Ctrl+G).',
    keywords: ['cluster', 'box', 'container', 'frame'],
    fields: [F.description],
    size: { width: 400, height: 260 },
  }),
];
