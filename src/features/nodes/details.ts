import type { Capability } from '../../types';
import { str } from '../../utils/misc';

/**
 * Optional detail lines of integrated services that the user can choose to
 * display on the card (props.display holds the selected keys).
 */
export interface DetailOption {
  key: string;
  label: string;
  /** Text shown on the card. */
  format: (value: string) => string;
  mono?: boolean;
}

export const DETAIL_OPTIONS: Partial<Record<Capability, DetailOption[]>> = {
  vpn: [
    { key: 'vpnIp', label: 'Tunnel IP', format: (v) => v, mono: true },
    { key: 'vpnProtocol', label: 'Protocol', format: (v) => v },
    { key: 'vpnMode', label: 'Mode', format: (v) => v },
    { key: 'vpnEndpoint', label: 'Public endpoint', format: (v) => `↗ ${v}`, mono: true },
    { key: 'vpnNetwork', label: 'Tunnel network', format: (v) => `net ${v}`, mono: true },
  ],
  wifi: [
    { key: 'ssid', label: 'SSID', format: (v) => `SSID ${v}` },
    { key: 'band', label: 'Band', format: (v) => v },
    { key: 'wifiStandard', label: 'Standard', format: (v) => v },
    { key: 'wifiSecurity', label: 'Security', format: (v) => v },
  ],
};

const CAPABILITY_TOGGLE: Record<string, string> = { vpn: 'vpn', wifi: 'wifi' };
const COLORS: Record<string, string> = { vpn: '#059669', wifi: '#0ea5e9' };

/** Keys displayed by default when a service is enabled. */
export const DEFAULT_DISPLAY: Partial<Record<Capability, string[]>> = { vpn: ['vpnIp'], wifi: ['ssid'] };

export function displayedKeys(props: Record<string, unknown>): string[] {
  return Array.isArray(props.display) ? props.display.filter((k): k is string => typeof k === 'string') : [];
}

export interface DetailLine {
  key: string;
  text: string;
  color: string;
  mono?: boolean;
  capability: Capability;
}

/** Lines to draw on the card, for enabled services only. */
export function detailLines(props: Record<string, unknown>): DetailLine[] {
  const shown = new Set(displayedKeys(props));
  const out: DetailLine[] = [];
  for (const [cap, options] of Object.entries(DETAIL_OPTIONS) as [Capability, DetailOption[]][]) {
    if (props[CAPABILITY_TOGGLE[cap]] !== true) continue;
    for (const o of options) {
      const v = str(props[o.key]);
      if (shown.has(o.key) && v) out.push({ key: o.key, text: o.format(v), color: COLORS[cap], mono: o.mono, capability: cap });
    }
  }
  return out;
}
