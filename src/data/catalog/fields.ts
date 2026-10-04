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

export const IP_LIST_FIELD: FieldDef = { key: 'ips', label: 'Additional IP addresses', type: 'ipList' };

const opts = (values: string[]) => values.map((v) => ({ value: v, label: v }));

/** Integrated VPN gateway (routers, firewalls). */
export const VPN_FIELDS: FieldDef[] = [
  { key: 'vpn', label: 'Integrated VPN gateway', type: 'boolean', section: 'vpn' },
  { key: 'vpnProtocol', label: 'Protocol', type: 'select', options: opts(['WireGuard', 'IPsec', 'OpenVPN', 'SSL VPN', 'L2TP/IPsec']), section: 'vpn', showIf: 'vpn' },
  { key: 'vpnMode', label: 'Mode', type: 'select', options: opts(['Site-to-site', 'Remote access', 'Site-to-site + remote access']), section: 'vpn', showIf: 'vpn' },
  { key: 'vpnIp', label: 'Tunnel IP (this device)', type: 'ip', placeholder: '10.99.0.1', section: 'vpn', showIf: 'vpn' },
  { key: 'vpnEndpoint', label: 'Public endpoint', type: 'text', placeholder: 'vpn.example.com or 203.0.113.10', mono: true, section: 'vpn', showIf: 'vpn' },
  { key: 'vpnNetwork', label: 'Tunnel network', type: 'cidr', placeholder: '10.99.0.0/24', section: 'vpn', showIf: 'vpn' },
  { key: 'vpnPeers', label: 'Peers / notes', type: 'textarea', placeholder: 'branch-rtr-01, road warriors', section: 'vpn', showIf: 'vpn' },
];

export const HOST_FIREWALL_PRODUCTS = ['nftables', 'iptables', 'firewalld', 'ufw', 'Windows Defender Firewall', 'pf', 'Other'];

/** Firewall running directly on the machine. */
export const FIREWALL_FIELDS: FieldDef[] = [
  { key: 'fw', label: 'Host firewall', type: 'boolean', section: 'firewall' },
  { key: 'fwProduct', label: 'Product', type: 'select', options: opts(HOST_FIREWALL_PRODUCTS), section: 'firewall', showIf: 'fw' },
  { key: 'fwPolicy', label: 'Inbound policy', type: 'select', options: opts(['Default deny', 'Default allow', 'Custom']), section: 'firewall', showIf: 'fw' },
];

/** Integrated Wi-Fi access point (e.g. a router with built-in Wi-Fi). */
export const WIFI_FIELDS: FieldDef[] = [
  { key: 'wifi', label: 'Integrated Wi-Fi access point', type: 'boolean', section: 'wifi' },
  { key: 'ssid', label: 'SSID(s)', type: 'text', placeholder: 'Corp, Guest', section: 'wifi', showIf: 'wifi' },
  { key: 'band', label: 'Band', type: 'select', options: opts(['2.4 GHz', '5 GHz', '6 GHz', 'Dual band', 'Tri band']), section: 'wifi', showIf: 'wifi' },
  { key: 'wifiStandard', label: 'Standard', type: 'select', options: opts(['Wi-Fi 5 (ac)', 'Wi-Fi 6 (ax)', 'Wi-Fi 6E', 'Wi-Fi 7 (be)']), section: 'wifi', showIf: 'wifi' },
  { key: 'wifiSecurity', label: 'Security', type: 'select', options: opts(['WPA2-Personal', 'WPA3-Personal', 'WPA2-Enterprise', 'WPA3-Enterprise', 'Open']), section: 'wifi', showIf: 'wifi' },
];

/** Devices of one stack / MLAG / vPC pair / HA cluster act as one logical device. */
export const REDUNDANCY_GROUP_FIELD: FieldDef = {
  key: 'redundancyGroup',
  label: 'Redundancy group',
  type: 'text',
  placeholder: 'stack-1, vpc-core, fw-ha…',
  help: 'Stack, MLAG / vPC pair or HA cluster. Devices with the same group act as one for bonds.',
  mono: true,
};
