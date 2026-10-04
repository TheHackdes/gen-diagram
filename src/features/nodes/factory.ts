import type { XYPosition } from '@xyflow/react';
import { getDefinition } from '../../data/catalog';
import type { InfraNode, LibraryPreset } from '../../types';
import { uid } from '../../utils/misc';
import { fitDeviceHeight } from './ips';

const NAME_PREFIX: Record<string, string> = {
  router: 'rtr',
  switch: 'sw',
  'l3-switch': 'core-sw',
  firewall: 'fw',
  'sec-firewall': 'fw',
  'load-balancer': 'lb',
  'access-point': 'ap',
  'vpn-gateway': 'vpn-gw',
  server: 'srv',
  'rack-server': 'srv',
  'blade-server': 'blade',
  'database-server': 'db',
  'web-server': 'web',
  'app-server': 'app',
  'dns-server': 'dns',
  'dhcp-server': 'dhcp',
  nas: 'nas',
  san: 'san',
  proxmox: 'pve',
  esxi: 'esxi',
  hyperv: 'hv',
  kvm: 'kvm',
  vm: 'vm',
  lxc: 'ct',
  'docker-host': 'docker',
  'docker-container': 'container',
  bridge: 'vmbr',
  pc: 'pc',
  laptop: 'laptop',
  bastion: 'bastion',
  'reverse-proxy': 'rproxy',
};

/** Generate a unique, readable node name (e.g. "sw-02"). */
export function uniqueName(base: string, existing: Iterable<string>): string {
  const taken = new Set(existing);
  if (!taken.has(base) && /\d$/.test(base)) return base;
  for (let i = 1; i < 1000; i++) {
    const candidate = `${base}-${String(i).padStart(2, '0')}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${uid()}`;
}

export function defaultNameFor(type: string): string {
  const def = getDefinition(type);
  if (def.kind === 'zone' || def.kind === 'annotation') return def.label;
  return NAME_PREFIX[type] ?? type;
}

const AUTO_HEIGHT = new Set(['title', 'text', 'legend', 'rulesTable']);
const AUTO_WIDTH = new Set(['title', 'rulesTable', 'legend']);

export interface CreateNodeOptions {
  position: XYPosition;
  parentId?: string;
  existingNames?: Iterable<string>;
  name?: string;
  props?: Record<string, unknown>;
  size?: { width: number; height: number };
}

export function createNode(type: string, opts: CreateNodeOptions): InfraNode {
  const def = getDefinition(type);
  const names = opts.existingNames ?? [];
  const isNamed = def.kind === 'device' || def.kind === 'container';
  const base = opts.name ?? defaultNameFor(type);
  const name = isNamed ? uniqueName(base, names) : base;
  const node: InfraNode = {
    id: uid('n_'),
    type: def.renderer,
    position: opts.position,
    data: {
      type: def.type,
      name,
      props: { ...(def.defaults ?? {}), ...(opts.props ?? {}) },
    },
    width: opts.size?.width ?? def.size.width,
    height: opts.size?.height ?? def.size.height,
  };
  // Text-like annotations grow with their content.
  if (!opts.size && AUTO_HEIGHT.has(def.renderer)) delete node.height;
  if (!opts.size && AUTO_WIDTH.has(def.renderer)) delete node.width;
  if (opts.parentId) node.parentId = opts.parentId;
  return withLayer(fitDeviceHeight(node));
}

/** Areas render behind equipment at the same nesting level so they never hide it. */
export function withLayer(node: InfraNode): InfraNode {
  if (node.zIndex !== undefined) return node;
  const kind = getDefinition(node.data.type).kind;
  return kind === 'zone' || kind === 'container' || node.data.type === 'area' ? { ...node, zIndex: -1 } : node;
}

export function createNodeFromPreset(preset: LibraryPreset, opts: Omit<CreateNodeOptions, 'name' | 'props'>): InfraNode {
  return createNode(preset.type, { ...opts, name: preset.name, props: preset.props });
}
