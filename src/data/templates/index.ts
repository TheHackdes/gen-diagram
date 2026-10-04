import type { InfraEdge, InfraNode, Vlan } from '../../types';
import { TemplateBuilder, VLAN_COLORS } from './builder';

export interface TemplateResult {
  nodes: InfraNode[];
  edges: InfraEdge[];
  vlans: Vlan[];
}

export interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  tags: string[];
  build: () => TemplateResult;
}

const [VIOLET, BLUE, GREEN, AMBER, RED, , , SLATE] = VLAN_COLORS;

function blank(): TemplateResult {
  return { nodes: [], edges: [], vlans: [] };
}

function smallOffice(): TemplateResult {
  const b = new TemplateBuilder().vlan(10, 'LAN', '192.168.1.0/24', BLUE, 'Office network');
  b.add('title', 'Title', { text: 'Small office network', subtitle: 'Single site · 1 VLAN' });
  const inet = b.add('internet', 'Internet', { isp: 'Fiber ISP', bandwidth: '1 Gbps' });
  const fw = b.add('firewall', 'fw-01', { ip: '192.168.1.1', product: 'OPNsense', vlan: '10' });
  const sw = b.add('switch', 'sw-01', { ip: '192.168.1.2', vlan: '10', model: '24-port PoE' });
  const lan = b.vlanZone(10);
  const pc1 = b.add('pc', 'pc-01', { os: 'windows-11', osVersion: '24H2', ip: '192.168.1.101', vlan: '10' }, lan);
  const pc2 = b.add('pc', 'pc-02', { os: 'windows-11', osVersion: '24H2', ip: '192.168.1.102', vlan: '10' }, lan);
  const srv = b.add('server', 'srv-files-01', { os: 'debian', osVersion: '13', ip: '192.168.1.10', vlan: '10', role: 'File server' }, lan);
  const prn = b.add('printer', 'prn-01', { ip: '192.168.1.20', vlan: '10' }, lan);
  b.link(inet, fw).link(fw, sw).link(sw, pc1).link(sw, pc2).link(sw, srv).link(sw, prn);
  b.add('legend', 'Legend', { text: 'Legend', showVlans: true, showLinks: true });
  return b.build();
}

function proxmoxLab(): TemplateResult {
  const b = new TemplateBuilder()
    .vlan(10, 'Management', '192.168.10.0/24', VIOLET)
    .vlan(20, 'Servers', '192.168.20.0/24', BLUE);
  b.add('title', 'Title', { text: 'Proxmox homelab', subtitle: 'Virtualization node with VMs and LXC containers' });
  const inet = b.add('internet', 'Internet', {});
  const fw = b.add('firewall', 'fw-01', { ip: '192.168.10.1', product: 'pfSense', vlan: '10' });
  const sw = b.add('switch', 'sw-01', { ip: '192.168.10.2', vlan: '10' });
  const zone = b.vlanZone(20);
  const pve = b.add('proxmox', 'pve-01', { ip: '192.168.20.10', version: '8.4', vlan: '20', ram: '64 GB' }, zone);
  b.add('vm', 'vm-ubuntu-01', { os: 'ubuntu', osVersion: '24.04', ip: '192.168.20.21', vlan: '20', vmid: '101' }, pve);
  b.add('vm', 'vm-win-01', { os: 'windows-server', osVersion: '2022', ip: '192.168.20.22', vlan: '20', vmid: '102' }, pve);
  b.add('lxc', 'ct-pihole', { os: 'debian', osVersion: '12', ip: '192.168.20.53', vlan: '20', ctid: '200' }, pve);
  b.add('lxc', 'ct-alpine', { os: 'alpine', osVersion: '3.22', ip: '192.168.20.54', vlan: '20', ctid: '201' }, pve);
  const nas = b.add('nas', 'nas-01', { ip: '192.168.20.50', vlan: '20', capacity: '16 TB', protocols: 'NFS, SMB' }, zone);
  b.link(inet, fw).link(fw, sw).link(sw, pve).link(sw, nas).link(pve, nas, { connType: 'logical', label: 'NFS' });
  return b.build();
}

function threeTier(): TemplateResult {
  const b = new TemplateBuilder()
    .vlan(50, 'DMZ', '10.0.50.0/24', RED, 'Exposed web tier')
    .vlan(60, 'Application', '10.0.60.0/24', BLUE)
    .vlan(70, 'Database', '10.0.70.0/24', AMBER);
  b.add('title', 'Title', { text: '3-tier web application', subtitle: 'Web · Application · Database' });
  const inet = b.add('internet', 'Internet', {});
  const fw = b.add('firewall', 'fw-01', { ip: '10.0.50.1', product: 'FortiGate', vlan: '50' });
  const dmz = b.vlanZone(50);
  const lb = b.add('load-balancer', 'lb-01', { ip: '10.0.50.5', vip: '10.0.50.100', algorithm: 'Round robin', vlan: '50' }, dmz);
  const web1 = b.add('web-server', 'web-01', { os: 'ubuntu', osVersion: '24.04', ip: '10.0.50.11', vlan: '50' }, dmz);
  const web2 = b.add('web-server', 'web-02', { os: 'ubuntu', osVersion: '24.04', ip: '10.0.50.12', vlan: '50' }, dmz);
  const appZ = b.vlanZone(60);
  const app1 = b.add('app-server', 'app-01', { os: 'rhel', osVersion: '9', ip: '10.0.60.11', vlan: '60' }, appZ);
  const app2 = b.add('app-server', 'app-02', { os: 'rhel', osVersion: '9', ip: '10.0.60.12', vlan: '60' }, appZ);
  const dbZ = b.vlanZone(70);
  const db1 = b.add('database-server', 'db-01', { os: 'rocky', osVersion: '9', ip: '10.0.70.11', vlan: '70', role: 'PostgreSQL primary' }, dbZ);
  const db2 = b.add('database-server', 'db-02', { os: 'rocky', osVersion: '9', ip: '10.0.70.12', vlan: '70', role: 'PostgreSQL replica' }, dbZ);
  b.link(inet, fw).link(fw, lb);
  b.link(lb, web1, { connType: 'logical', label: 'HTTP' }).link(lb, web2, { connType: 'logical', label: 'HTTP' });
  b.link(web1, app1, { connType: 'logical', label: 'API' }).link(web2, app2, { connType: 'logical', label: 'API' });
  b.link(app1, db1, { connType: 'logical', label: 'SQL' }).link(app2, db1, { connType: 'logical', label: 'SQL' });
  b.link(db1, db2, { connType: 'logical', label: 'Replication' });
  return b.build();
}

function enterprise(): TemplateResult {
  const b = new TemplateBuilder()
    .vlan(10, 'Management', '10.10.10.0/24', VIOLET)
    .vlan(20, 'Servers', '10.10.20.0/24', BLUE)
    .vlan(30, 'Users', '10.10.30.0/23', GREEN)
    .vlan(50, 'DMZ', '172.16.50.0/24', RED)
    .vlan(99, 'Network Management', '10.10.99.0/24', SLATE);
  b.add('title', 'Title', { text: 'Enterprise campus', subtitle: 'Core / distribution / access with server farm and DMZ' });
  const inet = b.add('internet', 'Internet', { isp: 'Tier-1 ISP', bandwidth: '10 Gbps' });
  const fw1 = b.add('firewall', 'fw-01', { ip: '10.10.99.1', vlan: '99', product: 'Palo Alto PA-3420' });
  const fw2 = b.add('firewall', 'fw-02', { ip: '10.10.99.3', vlan: '99', product: 'Palo Alto PA-3420' });
  const core1 = b.add('l3-switch', 'core-01', { ip: '10.10.99.11', vlan: '99', model: 'Nexus 9300' });
  const core2 = b.add('l3-switch', 'core-02', { ip: '10.10.99.12', vlan: '99', model: 'Nexus 9300' });
  const dist1 = b.add('l3-switch', 'dist-01', { ip: '10.10.99.21', vlan: '99', model: 'Catalyst 9500' });
  const dist2 = b.add('l3-switch', 'dist-02', { ip: '10.10.99.22', vlan: '99', model: 'Catalyst 9500' });
  const users = b.vlanZone(30);
  const acc1 = b.add('switch', 'acc-01', { ip: '10.10.99.31', vlan: '99' }, users);
  const acc2 = b.add('switch', 'acc-02', { ip: '10.10.99.32', vlan: '99' }, users);
  const pc1 = b.add('pc', 'pc-0101', { os: 'windows-11', osVersion: '24H2', ip: '10.10.30.21', vlan: '30' }, users);
  const pc2 = b.add('pc', 'pc-0102', { os: 'windows-11', osVersion: '24H2', ip: '10.10.30.22', vlan: '30' }, users);
  const ap = b.add('access-point', 'ap-01', { ip: '10.10.99.41', vlan: '99', ssid: 'Corp, Guest' }, users);
  const farm = b.vlanZone(20);
  const esx1 = b.add('esxi', 'esx-01', { ip: '10.10.20.11', version: '8.0 U3', vlan: '20', cluster: 'prod-cluster' }, farm);
  const esx2 = b.add('esxi', 'esx-02', { ip: '10.10.20.12', version: '8.0 U3', vlan: '20', cluster: 'prod-cluster' }, farm);
  b.add('vm', 'ad-01', { os: 'windows-server', osVersion: '2025', ip: '10.10.20.21', vlan: '20', role: 'Domain controller' }, esx1);
  b.add('vm', 'erp-app-01', { os: 'sles', osVersion: '15-sp7', ip: '10.10.20.31', vlan: '20' }, esx1);
  b.add('vm', 'ad-02', { os: 'windows-server', osVersion: '2025', ip: '10.10.20.22', vlan: '20', role: 'Domain controller' }, esx2);
  b.add('vm', 'erp-db-01', { os: 'rhel', osVersion: '9', ip: '10.10.20.41', vlan: '20' }, esx2);
  const san = b.add('san', 'san-01', { ip: '10.10.20.100', vlan: '20', capacity: '200 TB', protocols: 'iSCSI, FC' }, farm);
  const dmz = b.vlanZone(50);
  const rp = b.add('reverse-proxy', 'rproxy-01', { os: 'debian', osVersion: '13', ip: '172.16.50.10', vlan: '50' }, dmz);
  const web = b.add('web-server', 'web-01', { os: 'ubuntu', osVersion: '24.04', ip: '172.16.50.20', vlan: '50' }, dmz);
  const mgmt = b.vlanZone(10);
  const bastion = b.add('bastion', 'bastion-01', { os: 'debian', osVersion: '13', ip: '10.10.10.10', vlan: '10' }, mgmt);
  b.link(inet, fw1).link(inet, fw2);
  b.link(fw1, core1, { connType: 'fiber' }).link(fw2, core2, { connType: 'fiber' });
  b.link(core1, core2, { connType: 'fiber', label: 'vPC peer-link', speed: '100 Gbps' });
  b.link(core1, dist1).link(core2, dist2).link(core1, dist2).link(core2, dist1);
  b.link(dist1, acc1).link(dist2, acc2).link(acc1, pc1).link(acc1, pc2).link(acc2, ap);
  b.link(core1, esx1).link(core2, esx2).link(esx1, san, { connType: 'fiber' }).link(esx2, san, { connType: 'fiber' });
  b.link(fw1, rp, { vlan: '50', mode: 'access' }).link(rp, web, { connType: 'logical', label: 'HTTPS' });
  b.link(dist1, bastion);
  return b.build();
}

/** Full demo project shown on first launch. */
export function demoProject(): TemplateResult {
  const b = new TemplateBuilder()
    .vlan(10, 'Management', '192.168.10.0/24', VIOLET, 'Administration workstations and bastion')
    .vlan(20, 'Servers', '192.168.20.0/24', BLUE, 'Production servers and virtualization')
    .vlan(30, 'Users', '192.168.30.0/24', GREEN, 'Office users, Wi-Fi and printers')
    .vlan(50, 'DMZ', '192.168.50.0/24', RED, 'Internet-facing services')
    .vlan(99, 'Network Management', '192.168.99.0/24', SLATE, 'Switches, firewall and AP management');

  b.add('title', 'Title', { text: 'Acme Corp — Headquarters infrastructure', subtitle: 'Production network · revision 2026-10' });
  const inet = b.add('internet', 'Internet', { isp: 'Orange Business', bandwidth: '1 Gbps' });
  const fw = b.add('firewall', 'fw-edge-01', {
    ip: '192.168.99.1',
    publicIp: '203.0.113.10',
    product: 'OPNsense 25.7',
    vlan: '99',
    model: 'DEC2750',
  });
  const core = b.add('l3-switch', 'core-sw-01', {
    ip: '192.168.99.2',
    vlan: '99',
    vendor: 'Cisco',
    model: 'Catalyst 9300-48P',
  });

  const mgmt = b.vlanZone(10);
  const admin = b.add('pc', 'admin-pc-01', { os: 'windows-11', osVersion: '24H2', ip: '192.168.10.50', vlan: '10', user: 'IT admin' }, mgmt);
  const bastion = b.add('bastion', 'bastion-01', { os: 'debian', osVersion: '13', ip: '192.168.10.10', vlan: '10', gateway: '192.168.10.1' }, mgmt);

  const servers = b.vlanZone(20);
  const pve = b.add('proxmox', 'pve-01', {
    hostname: 'pve-01.acme.local',
    ip: '192.168.20.10',
    version: '8.4',
    vlan: '20',
    cpu: '2× EPYC 9124',
    ram: '256 GB',
  }, servers);
  b.add('vm', 'app-01', { os: 'debian', osVersion: '13', ip: '192.168.20.21', vlan: '20', vmid: '101', vcpu: '4', ram: '8 GB', role: 'Application server' }, pve);
  b.add('vm', 'dc-01', { os: 'windows-server', osVersion: '2022', ip: '192.168.20.11', vlan: '20', vmid: '100', vcpu: '2', ram: '4 GB', description: 'Active Directory domain controller' }, pve);
  b.add('lxc', 'dns-01', { os: 'debian', osVersion: '12', ip: '192.168.20.53', vlan: '20', ctid: '200', cores: '1', ram: '512 MB', description: 'Unbound resolver' }, pve);
  b.add('lxc', 'monitor-01', { os: 'alpine', osVersion: '3.22', ip: '192.168.20.60', vlan: '20', ctid: '201', cores: '2', ram: '2 GB', description: 'Prometheus + Grafana' }, pve);
  const docker = b.add('docker-host', 'docker-01', { os: 'ubuntu', osVersion: '24.04', ip: '192.168.20.30', vlan: '20', runsOn: 'vm' }, pve);
  const nginx = b.add('docker-container', 'nginx', { image: 'nginx', tag: '1.27', ip: '172.20.0.10', ports: '80:80, 443:443', dockerNetwork: 'frontend' }, docker);
  const front = b.add('docker-container', 'frontend', { image: 'acme/frontend', tag: '3.1.0', ip: '172.20.0.11', dockerNetwork: 'frontend' }, docker);
  const back = b.add('docker-container', 'backend', { image: 'acme/backend', tag: '2.4.1', ip: '172.20.0.12', dockerNetwork: 'backend' }, docker);
  const pg = b.add('docker-container', 'postgres', { image: 'postgres', tag: '17', ip: '172.20.0.20', dockerNetwork: 'backend' }, docker);
  const redis = b.add('docker-container', 'redis', { image: 'redis', tag: '7.4', ip: '172.20.0.21', dockerNetwork: 'backend' }, docker);
  const db = b.add('database-server', 'db-01', { os: 'rocky', osVersion: '9', ip: '192.168.20.40', vlan: '20', role: 'MariaDB (ERP)', gateway: '192.168.20.1' }, servers);
  const nas = b.add('nas', 'nas-01', { ip: '192.168.20.50', vlan: '20', capacity: '48 TB', protocols: 'NFS, SMB' }, servers);

  const users = b.vlanZone(30);
  const ap = b.add('access-point', 'ap-01', { ip: '192.168.99.20', vlan: '99', ssid: 'Acme, Acme-Guest', band: 'Dual band' }, users);
  const laptop = b.add('laptop', 'laptop-01', { os: 'windows-11', osVersion: '24H2', ip: '192.168.30.101', vlan: '30' }, users);
  const prn = b.add('printer', 'prn-01', { ip: '192.168.30.20', vlan: '30' }, users);

  const dmz = b.vlanZone(50);
  const rproxy = b.add('reverse-proxy', 'rproxy-01', { os: 'debian', osVersion: '13', ip: '192.168.50.10', vlan: '50', gateway: '192.168.50.1' }, dmz);
  const web = b.add('web-server', 'web-01', { os: 'ubuntu', osVersion: '24.04', ip: '192.168.50.20', vlan: '50', gateway: '192.168.50.1' }, dmz);

  b.link(inet, fw, { targetPort: 'port1 (WAN)' });
  b.link(fw, core, { connType: 'fiber', sourcePort: 'port2', mode: 'trunk', vlan: '10,20,30,99' });
  b.link(fw, rproxy, { sourcePort: 'port3', mode: 'access', vlan: '50' });
  b.link(rproxy, web, { connType: 'logical', label: 'HTTPS' });
  b.link(core, pve, { mode: 'trunk', vlan: '20' });
  b.link(core, db);
  b.link(core, nas);
  b.link(core, admin);
  b.link(core, bastion);
  b.link(core, ap);
  b.link(core, prn);
  b.link(ap, laptop);
  b.link(pve, nas, { connType: 'logical', label: 'NFS' });
  b.link(nginx, front, { connType: 'logical' });
  b.link(nginx, back, { connType: 'logical' });
  b.link(back, pg, { connType: 'logical' });
  b.link(back, redis, { connType: 'logical' });
  b.add('legend', 'Legend', { text: 'Legend', showVlans: true, showLinks: true });
  return b.build();
}

export const TEMPLATES: TemplateInfo[] = [
  { id: 'demo', name: 'Acme HQ (demo)', description: 'Complete example: VLANs, DMZ, Proxmox with VMs, LXC and Docker.', tags: ['Proxmox', 'Docker', 'VLAN'], build: demoProject },
  { id: 'small-office', name: 'Small office', description: 'Internet, firewall, switch, PCs and a file server.', tags: ['SMB'], build: smallOffice },
  { id: 'proxmox', name: 'Proxmox homelab', description: 'Proxmox node with VMs, LXC containers and NAS.', tags: ['Proxmox', 'Homelab'], build: proxmoxLab },
  { id: 'three-tier', name: '3-tier application', description: 'Load balancer, web, application and database tiers.', tags: ['Web', 'HA'], build: threeTier },
  { id: 'enterprise', name: 'Enterprise campus', description: 'Redundant core/distribution/access, server farm, SAN and DMZ.', tags: ['Campus', 'VMware'], build: enterprise },
  { id: 'blank', name: 'Blank canvas', description: 'Start from scratch.', tags: [], build: blank },
];
