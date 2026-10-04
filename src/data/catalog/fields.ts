import type { FieldDef } from '../../types';

/** Reusable property field definitions. */
export const F = {
  hostname: { key: 'hostname', label: 'Hostname', type: 'text', placeholder: 'srv-prod-01.example.local', mono: true },
  ip: { key: 'ip', label: 'IP address', type: 'ip', placeholder: '192.168.10.20' },
  mgmtIp: { key: 'ip', label: 'Management IP', type: 'ip', placeholder: '192.168.99.2' },
  publicIp: { key: 'publicIp', label: 'Public IP', type: 'ip', placeholder: '203.0.113.10' },
  network: { key: 'network', label: 'Network', type: 'cidr', placeholder: '192.168.10.0/24' },
  gateway: { key: 'gateway', label: 'Gateway', type: 'ip', placeholder: '192.168.10.1' },
  mac: { key: 'mac', label: 'MAC address', type: 'mac', placeholder: 'AA:BB:CC:DD:EE:FF', advanced: true },
  vlan: { key: 'vlan', label: 'VLAN', type: 'vlan' },
  os: { key: 'os', label: 'Operating system', type: 'os' },
  role: { key: 'role', label: 'Role', type: 'text', placeholder: 'Application Server' },
  description: { key: 'description', label: 'Description', type: 'textarea', placeholder: 'What is this used for?' },
  vendor: { key: 'vendor', label: 'Vendor', type: 'text', placeholder: 'Cisco', advanced: true },
  model: { key: 'model', label: 'Model', type: 'text', placeholder: 'Catalyst 9300', advanced: true },
  firmware: { key: 'firmware', label: 'Firmware / version', type: 'text', advanced: true },
  serial: { key: 'serial', label: 'Serial number', type: 'text', advanced: true, mono: true },
  location: { key: 'location', label: 'Location / rack', type: 'text', placeholder: 'DC1 · Rack A3 · U12', advanced: true },
  cpu: { key: 'cpu', label: 'CPU', type: 'text', placeholder: '2× Xeon Silver 4314', advanced: true },
  ram: { key: 'ram', label: 'Memory', type: 'text', placeholder: '128 GB', advanced: true },
  disk: { key: 'disk', label: 'Storage', type: 'text', placeholder: '2× 960 GB NVMe', advanced: true },
  dns: { key: 'dns', label: 'DNS servers', type: 'text', placeholder: '192.168.10.53', advanced: true, mono: true },
  portCount: { key: 'portCount', label: 'Port count', type: 'number', placeholder: '48', advanced: true },
} satisfies Record<string, FieldDef>;

export const DESCRIPTION_ONLY: FieldDef[] = [F.description];

export const NETWORK_DEVICE_FIELDS: FieldDef[] = [
  F.mgmtIp,
  F.vlan,
  F.model,
  F.vendor,
  F.portCount,
  F.firmware,
  F.mac,
  F.serial,
  F.location,
  F.description,
];

export const SERVER_FIELDS: FieldDef[] = [
  F.hostname,
  F.ip,
  F.os,
  F.role,
  F.vlan,
  F.network,
  F.gateway,
  F.description,
  F.mac,
  F.dns,
  F.cpu,
  F.ram,
  F.disk,
  F.vendor,
  F.model,
  F.serial,
  F.location,
];

export const ENDPOINT_FIELDS: FieldDef[] = [
  F.hostname,
  F.ip,
  F.os,
  F.vlan,
  { key: 'user', label: 'Assigned user', type: 'text', advanced: true },
  F.gateway,
  F.mac,
  F.model,
  F.location,
  F.description,
];

export const SECURITY_FIELDS: FieldDef[] = [
  F.ip,
  F.vlan,
  { key: 'product', label: 'Product', type: 'text', placeholder: 'OPNsense, FortiGate…' },
  F.vendor,
  F.model,
  F.firmware,
  F.mac,
  F.location,
  F.description,
];
