import type { CategoryId } from '../types';

export interface CategoryInfo {
  id: CategoryId;
  label: string;
  color: string;
  icon: string;
}

export const CATEGORIES: CategoryInfo[] = [
  { id: 'network', label: 'Network', color: '#2563eb', icon: 'switch' },
  { id: 'servers', label: 'Servers & Storage', color: '#7c3aed', icon: 'server' },
  { id: 'virtualization', label: 'Virtualization', color: '#ea580c', icon: 'vm' },
  { id: 'os', label: 'Operating Systems', color: '#0d9488', icon: 'brand:linux' },
  { id: 'security', label: 'Security', color: '#dc2626', icon: 'shield' },
  { id: 'cloud', label: 'Cloud', color: '#0284c7', icon: 'cloud' },
  { id: 'logical', label: 'Networks & VLANs', color: '#059669', icon: 'vlan' },
  { id: 'generic', label: 'Endpoints & Users', color: '#64748b', icon: 'laptop' },
  { id: 'annotations', label: 'Annotations', color: '#ca8a04', icon: 'note' },
];

export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<
  CategoryId,
  CategoryInfo
>;
