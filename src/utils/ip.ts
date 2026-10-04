/** Small IPv4 helpers used by validation and smart suggestions. */

export function parseIPv4(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const m = value.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

export function formatIPv4(n: number): string {
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

export interface Cidr {
  network: number;
  prefix: number;
  mask: number;
}

export function parseCidr(value: unknown): Cidr | null {
  if (typeof value !== 'string') return null;
  const [ip, prefixStr] = value.trim().split('/');
  const addr = parseIPv4(ip);
  const prefix = Number(prefixStr);
  if (addr === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32 || prefixStr === undefined) return null;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return { network: (addr & mask) >>> 0, prefix, mask };
}

export function ipInCidr(ip: unknown, cidr: unknown): boolean | null {
  const a = parseIPv4(ip);
  const c = parseCidr(cidr);
  if (a === null || c === null) return null;
  return ((a & c.mask) >>> 0) === c.network;
}

export function cidrEquals(a: unknown, b: unknown): boolean {
  const x = parseCidr(a);
  const y = parseCidr(b);
  return !!x && !!y && x.network === y.network && x.prefix === y.prefix;
}

/** Do two networks share at least one address (one contains the other)? */
export function cidrOverlaps(a: unknown, b: unknown): boolean {
  const x = parseCidr(a);
  const y = parseCidr(b);
  if (!x || !y) return false;
  const mask = x.prefix < y.prefix ? x.mask : y.mask;
  return ((x.network & mask) >>> 0) === ((y.network & mask) >>> 0);
}

export function isValidIPv4(value: unknown): boolean {
  return parseIPv4(value) !== null;
}

export function isValidCidr(value: unknown): boolean {
  return parseCidr(value) !== null;
}

export function isValidMac(value: unknown): boolean {
  return typeof value === 'string' && /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/.test(value.trim());
}

/** First usable host of a subnet, e.g. 192.168.20.0/24 → 192.168.20.1 */
export function firstHost(cidr: unknown): string | null {
  const c = parseCidr(cidr);
  if (!c || c.prefix > 30) return null;
  return formatIPv4(c.network + 1);
}
