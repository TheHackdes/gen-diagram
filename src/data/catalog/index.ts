import type { Capability, ComponentDefinition, FieldDef, LibraryPreset, NodeRole, OperatingSystem } from '../../types';
import { CATEGORY_BY_ID } from '../categories';
import { getAllOperatingSystems } from '../operatingSystems';
import { ANNOTATIONS } from './annotations';
import { FIREWALL_FIELDS, IP_LIST_FIELD, REDUNDANCY_GROUP_FIELD, VPN_FIELDS, WIFI_FIELDS } from './fields';
import { GENERIC, LOGICAL } from './logicalGeneric';
import { NETWORK_DEVICES } from './networkDevices';
import { SERVERS } from './servers';
import { CLOUD, SECURITY } from './securityCloud';
import { VIRTUALIZATION } from './virtualization';

/**
 * Component registry.
 * To add a component: create its definition in one of the category files
 * (or a new file) and append it here. Everything else (library, search,
 * properties panel, validation, layout) is driven by the definition.
 */
const BASE_DEFINITIONS: ComponentDefinition[] = [
  ...NETWORK_DEVICES,
  ...SERVERS,
  ...VIRTUALIZATION,
  ...SECURITY,
  ...CLOUD,
  ...LOGICAL,
  ...GENERIC,
  ...ANNOTATIONS,
];

/** Integrated services available by default for each role (a definition can override them). */
const DEFAULT_CAPABILITIES: Partial<Record<NodeRole, Capability[]>> = {
  router: ['vpn', 'firewall', 'wifi'],
  firewall: ['vpn', 'wifi'],
  server: ['firewall'],
  security: ['firewall'],
  hypervisor: ['firewall'],
  vm: ['firewall'],
  lxc: ['firewall'],
  'docker-host': ['firewall'],
  endpoint: ['firewall'],
};

/** Equipment that can be stacked / paired (MLAG, vPC, HA). */
const REDUNDANT_ROLES = new Set<NodeRole>(['switch', 'core-switch', 'router', 'firewall', 'load-balancer']);

const CAPABILITY_FIELDS: Record<Capability, FieldDef[]> = { vpn: VPN_FIELDS, firewall: FIREWALL_FIELDS, wifi: WIFI_FIELDS };

/**
 * Every addressable node gets a list of additional IPs right after its main
 * IP, plus the fields of its integrated services.
 */
function enrich(def: ComponentDefinition): ComponentDefinition {
  const ipIndex = def.fields.findIndex((f) => f.key === 'ip');
  if (ipIndex < 0) return def;
  const fields = [...def.fields.slice(0, ipIndex + 1), IP_LIST_FIELD, ...def.fields.slice(ipIndex + 1)];
  if (REDUNDANT_ROLES.has(def.role)) {
    const vlanIndex = fields.findIndex((f) => f.key === 'vlan');
    fields.splice(vlanIndex >= 0 ? vlanIndex + 1 : fields.length, 0, REDUNDANCY_GROUP_FIELD);
  }
  const capabilities = def.capabilities ?? DEFAULT_CAPABILITIES[def.role] ?? [];
  for (const c of capabilities) fields.push(...CAPABILITY_FIELDS[c]);
  return { ...def, fields, capabilities };
}

export const DEFINITIONS: ComponentDefinition[] = BASE_DEFINITIONS.map(enrich);

const BY_TYPE = new Map(DEFINITIONS.map((d) => [d.type, d]));

const FALLBACK = DEFINITIONS.find((d) => d.type === 'device')!;

export function getDefinition(type: string): ComponentDefinition {
  return BY_TYPE.get(type) ?? FALLBACK;
}

export function hasDefinition(type: string): boolean {
  return BY_TYPE.has(type);
}

export function colorOf(def: ComponentDefinition): string {
  return def.color ?? CATEGORY_BY_ID[def.category].color;
}

export function isContainerDef(def: ComponentDefinition): boolean {
  return def.accepts !== undefined;
}

export function definitionHasField(def: ComponentDefinition, key: string): boolean {
  return def.fields.some((f) => f.key === key);
}

/** Can `childType` be placed inside a node of type `parentType`? */
export function canContain(parentType: string, childType: string): boolean {
  const parent = getDefinition(parentType);
  const child = getDefinition(childType);
  if (!parent.accepts) return false;
  if (parent.accepts === '*') {
    // Zones accept anything except big structural annotations.
    return child.type !== 'legend' && child.type !== 'title';
  }
  return parent.accepts.includes(childType);
}

/* ------------------------------------------------------------------ */
/* Library presets                                                     */
/* ------------------------------------------------------------------ */

const DOCKER_IMAGES: { image: string; tag: string; port?: string; label: string }[] = [
  { image: 'nginx', tag: '1.27', port: '80:80, 443:443', label: 'nginx' },
  { image: 'postgres', tag: '17', port: '5432:5432', label: 'PostgreSQL' },
  { image: 'redis', tag: '7.4', label: 'Redis' },
  { image: 'mariadb', tag: '11.4', label: 'MariaDB' },
  { image: 'traefik', tag: '3.2', port: '80:80, 443:443', label: 'Traefik' },
  { image: 'grafana/grafana', tag: '11.3.0', port: '3000:3000', label: 'Grafana' },
  { image: 'prom/prometheus', tag: 'v3.0.0', port: '9090:9090', label: 'Prometheus' },
  { image: 'node', tag: '22-alpine', label: 'Node.js app' },
];

function osPresets(os: OperatingSystem): LibraryPreset[] {
  const latest = os.versions[os.versions.length - 1]?.id ?? '';
  const props = { os: os.id, osVersion: latest };
  const kw = [os.name, os.short, os.family, ...(os.keywords ?? [])];
  const isLinux = os.family === 'linux';
  const list: LibraryPreset[] = [
    {
      id: `os:${os.id}`,
      type: os.usage === 'desktop' ? 'pc' : 'server',
      label: os.name,
      category: 'os',
      icon: os.icon,
      description: `${os.name} host. Drop onto an existing node to set its OS.`,
      keywords: kw,
      name: os.usage === 'desktop' ? `${os.short.toLowerCase().replace(/\s+/g, '-')}-pc` : `${os.short.toLowerCase().replace(/\s+/g, '-')}-srv`,
      props,
      osId: os.id,
    },
  ];
  if (os.usage !== 'desktop') {
    list.push({
      id: `os:${os.id}:server`,
      type: 'server',
      label: `${os.name} Server`,
      category: 'os',
      icon: os.icon,
      keywords: kw,
      name: `${os.short.toLowerCase().replace(/\s+/g, '-')}-srv`,
      props,
      searchOnly: true,
    });
  }
  list.push({
    id: `os:${os.id}:vm`,
    type: 'vm',
    label: `${os.name} VM`,
    category: 'virtualization',
    icon: os.icon,
    keywords: kw,
    name: `${os.short.toLowerCase().replace(/\s+/g, '-')}-vm`,
    props,
    searchOnly: true,
  });
  if (isLinux) {
    list.push({
      id: `os:${os.id}:lxc`,
      type: 'lxc',
      label: `${os.name} LXC`,
      category: 'virtualization',
      icon: os.icon,
      keywords: kw,
      name: `${os.short.toLowerCase().replace(/\s+/g, '-')}-ct`,
      props,
      searchOnly: true,
    });
  }
  return list;
}

export function getLibraryPresets(): LibraryPreset[] {
  const base: LibraryPreset[] = DEFINITIONS.map((d) => ({
    id: d.type,
    type: d.type,
    label: d.label,
    category: d.category,
    icon: d.icon,
    description: d.description,
    keywords: d.keywords,
  }));
  const docker: LibraryPreset[] = DOCKER_IMAGES.map((img) => ({
    id: `docker:${img.image}`,
    type: 'docker-container',
    label: `${img.label} container`,
    category: 'virtualization',
    icon: 'container',
    keywords: ['docker', img.image],
    name: img.image.split('/').pop(),
    props: { image: img.image, tag: img.tag, ports: img.port ?? '' },
    searchOnly: true,
  }));

  const os = getAllOperatingSystems().flatMap(osPresets);
  return [...base, ...os, ...docker];
}

export function getPreset(id: string): LibraryPreset | undefined {
  return getLibraryPresets().find((p) => p.id === id);
}

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Ranked fuzzy-ish search over the library. */
export function searchLibrary(query: string): LibraryPreset[] {
  const q = normalize(query.trim());
  if (!q) return [];
  const terms = q.split(/\s+/);
  const scored: { p: LibraryPreset; score: number }[] = [];
  for (const p of getLibraryPresets()) {
    const label = normalize(p.label);
    const hay = normalize(
      [p.label, p.type, CATEGORY_BY_ID[p.category].label, ...(p.keywords ?? [])].join(' '),
    );
    if (!terms.every((t) => hay.includes(t))) continue;
    let score = 0;
    if (label === q) score += 100;
    if (label.startsWith(q)) score += 50;
    if (label.includes(q)) score += 20;
    if (!p.searchOnly) score += 5;
    score -= label.length / 100;
    scored.push({ p, score });
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.p);
}
