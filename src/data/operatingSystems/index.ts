import type { OperatingSystem, OsFamily } from '../../types';
import { LINUX_OS } from './linux';
import { OTHER_OS } from './other';
import { WINDOWS_OS } from './windows';

/**
 * Operating system registry.
 *
 * Built-in systems live in this folder (one file per family). To add a new
 * distribution, append an entry to the matching file — it automatically shows
 * up in the library, the search, the OS picker and the validation rules.
 * Users can also register custom systems at runtime (stored in the project).
 */
export const BUILTIN_OS: OperatingSystem[] = [...WINDOWS_OS, ...LINUX_OS, ...OTHER_OS];

export const OS_FAMILIES: { id: OsFamily; label: string }[] = [
  { id: 'windows', label: 'Windows' },
  { id: 'linux', label: 'Linux' },
  { id: 'bsd', label: 'BSD' },
  { id: 'macos', label: 'macOS' },
  { id: 'network', label: 'Network OS' },
  { id: 'other', label: 'Other' },
];

let customOs: OperatingSystem[] = [];

export function setCustomOperatingSystems(list: OperatingSystem[]): void {
  customOs = list;
}

export function getAllOperatingSystems(): OperatingSystem[] {
  return [...BUILTIN_OS, ...customOs];
}

export function getOperatingSystem(id: unknown): OperatingSystem | undefined {
  if (typeof id !== 'string' || !id) return undefined;
  return BUILTIN_OS.find((o) => o.id === id) ?? customOs.find((o) => o.id === id);
}

export function formatOs(osId: unknown, version: unknown, compact = false): string {
  const os = getOperatingSystem(osId);
  if (!os) return '';
  const v = os.versions.find((x) => x.id === version);
  const name = compact ? os.short : os.name;
  if (!v) return name;
  // Avoid "Rocky Rocky 9" when the version label already contains the name.
  return v.label.toLowerCase().startsWith(os.short.toLowerCase()) ? v.label : `${name} ${v.label}`;
}

export function formatOsCompact(osId: unknown, version: unknown): string {
  const os = getOperatingSystem(osId);
  if (!os) return '';
  const v = typeof version === 'string' ? version : '';
  return v ? `${os.short} ${v.replace(/^stream-/, 'Stream ').replace(/^leap-/, 'Leap ')}` : os.short;
}
