import type { Edge, Node, Viewport } from '@xyflow/react';

/* ------------------------------------------------------------------ */
/* Catalog                                                             */
/* ------------------------------------------------------------------ */

export type CategoryId =
  | 'network'
  | 'servers'
  | 'virtualization'
  | 'os'
  | 'security'
  | 'cloud'
  | 'logical'
  | 'generic'
  | 'annotations';

/**
 * How a node behaves on the canvas.
 * - device: a single piece of equipment (card)
 * - container: equipment that hosts other nodes (hypervisor, docker host)
 * - zone: a logical area (network, VLAN, DMZ, group)
 * - annotation: documentation-only element (text, note, legend…)
 */
export type NodeKind = 'device' | 'container' | 'zone' | 'annotation';

/** React Flow renderer used for a node. */
export type NodeRenderer =
  | 'device'
  | 'container'
  | 'zone'
  | 'text'
  | 'title'
  | 'note'
  | 'legend'
  | 'separator'
  | 'arrow';

/** Semantic role, used by smart suggestions, layout and validation. */
export type NodeRole =
  | 'wan'
  | 'router'
  | 'firewall'
  | 'core-switch'
  | 'switch'
  | 'ap'
  | 'load-balancer'
  | 'vpn'
  | 'security'
  | 'server'
  | 'storage'
  | 'hypervisor'
  | 'vm'
  | 'lxc'
  | 'docker-host'
  | 'docker-container'
  | 'bridge'
  | 'endpoint'
  | 'cloud'
  | 'zone'
  | 'group'
  | 'annotation';

export type FieldType =
  | 'text'
  | 'textarea'
  | 'select'
  | 'ip'
  | 'cidr'
  | 'mac'
  | 'number'
  | 'vlan'
  | 'vlanList'
  | 'os'
  | 'ports'
  | 'color'
  | 'boolean';

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  options?: FieldOption[];
  /** Hidden behind "Advanced properties" by default. */
  advanced?: boolean;
  help?: string;
  mono?: boolean;
}

export interface ComponentDefinition {
  type: string;
  label: string;
  category: CategoryId;
  kind: NodeKind;
  renderer: NodeRenderer;
  role: NodeRole;
  icon: string;
  /** Overrides the category color. */
  color?: string;
  description: string;
  keywords?: string[];
  fields: FieldDef[];
  defaults?: Record<string, unknown>;
  size: { width: number; height: number };
  /** Node types this container accepts as children ('*' = anything but annotations). */
  accepts?: string[] | '*';
  /** Library preset ids suggested as children in the properties panel. */
  quickAdd?: string[];
  /** Short badge displayed on the card (VM, LXC…). */
  badge?: string;
  /** Prefix used when suggesting interface names. */
  portPattern?: (index: number) => string;
  /** Does not need a network connection (skips validation). */
  standalone?: boolean;
}

/** Item of the component library (a definition plus preset values). */
export interface LibraryPreset {
  id: string;
  type: string;
  label: string;
  category: CategoryId;
  icon?: string;
  description?: string;
  keywords?: string[];
  name?: string;
  props?: Record<string, unknown>;
  /** When set, dropping onto an existing node applies this OS instead of creating a node. */
  osId?: string;
  /** Only shown in search results (variants such as "Debian LXC"). */
  searchOnly?: boolean;
}

/* ------------------------------------------------------------------ */
/* Operating systems                                                   */
/* ------------------------------------------------------------------ */

export type OsFamily = 'windows' | 'linux' | 'bsd' | 'macos' | 'network' | 'other';

export interface OsVersion {
  id: string;
  label: string;
  lts?: boolean;
}

export interface OperatingSystem {
  id: string;
  family: OsFamily;
  name: string;
  /** Short name for compact badges. */
  short: string;
  icon: string;
  color: string;
  versions: OsVersion[];
  /** Typical usage, used to pick the device type when dragging an OS. */
  usage: 'server' | 'desktop' | 'both';
  vendor?: string;
  keywords?: string[];
  custom?: boolean;
}

/* ------------------------------------------------------------------ */
/* Diagram                                                             */
/* ------------------------------------------------------------------ */

export type ConnectionType =
  | 'ethernet'
  | 'fiber'
  | 'wifi'
  | 'vpn'
  | 'wan'
  | 'vlan'
  | 'logical'
  | 'generic'
  | 'arrow';

export interface InfraNodeData extends Record<string, unknown> {
  /** Catalog type, e.g. "switch", "proxmox". */
  type: string;
  name: string;
  props: Record<string, unknown>;
  locked?: boolean;
  /** Custom accent color overriding the catalog color. */
  color?: string;
}

export interface InfraEdgeData extends Record<string, unknown> {
  connType: ConnectionType;
  label?: string;
  speed?: string;
  sourcePort?: string;
  targetPort?: string;
  vlan?: string;
  mode?: '' | 'access' | 'trunk';
  description?: string;
}

export type InfraNode = Node<InfraNodeData, NodeRenderer>;
export type InfraEdge = Edge<InfraEdgeData, 'network'>;

export interface Vlan {
  uid: string;
  id: number;
  name: string;
  description?: string;
  subnet?: string;
  gateway?: string;
  color: string;
}

export interface ProjectSettings {
  snapToGrid: boolean;
  showGrid: boolean;
  showEdgeLabels: boolean;
  showPortLabels: boolean;
  showMinimap: boolean;
}

export interface ProjectMetadata {
  id: string;
  name: string;
  description?: string;
  author?: string;
  createdAt: string;
  updatedAt: string;
}

/** Serialized project (JSON file format). */
export interface ProjectFile {
  format: 'infracanvas';
  version: 1;
  metadata: ProjectMetadata;
  nodes: InfraNode[];
  networks: InfraNode[];
  groups: InfraNode[];
  annotations: InfraNode[];
  connections: InfraEdge[];
  vlans: Vlan[];
  customOperatingSystems?: OperatingSystem[];
  settings: ProjectSettings;
  viewport?: Viewport;
}

export type LayoutAlgorithm = 'hierarchical' | 'tree' | 'force' | 'grid' | 'network';

export type IssueSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  id: string;
  severity: IssueSeverity;
  message: string;
  nodeIds?: string[];
  edgeIds?: string[];
}
