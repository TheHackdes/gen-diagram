import type { ComponentDefinition } from '../../types';

export const DEVICE_SIZE = { width: 200, height: 64 };

type DeviceInput = Omit<ComponentDefinition, 'kind' | 'renderer' | 'size'> &
  Partial<Pick<ComponentDefinition, 'size' | 'renderer'>>;

export function device(def: DeviceInput): ComponentDefinition {
  return { kind: 'device', renderer: 'device', size: DEVICE_SIZE, ...def };
}

export function container(def: Omit<ComponentDefinition, 'kind' | 'renderer'>): ComponentDefinition {
  return { kind: 'container', renderer: 'container', ...def };
}

export function zone(def: Omit<ComponentDefinition, 'kind' | 'renderer' | 'role'> & {
  role?: ComponentDefinition['role'];
}): ComponentDefinition {
  return { kind: 'zone', renderer: 'zone', accepts: '*', role: 'zone', ...def };
}

export const ethPorts = (prefix: string, start = 0) => (i: number) => `${prefix}${i + start}`;
