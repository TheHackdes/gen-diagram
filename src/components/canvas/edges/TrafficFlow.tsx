import type { ConnectionType, InfraEdgeData } from '../../../types';
import { parseSpeed } from '../../../features/connections/parallel';

/** Stable pseudo-random number in [0, 1) from a link id, to desynchronise packets. */
function seed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

/** Faster links move their packets faster (log scale, 1 Gbps = 1). */
function speedFactor(data: InfraEdgeData | undefined): number {
  const mbps = parseSpeed(data?.speed);
  if (!mbps) return data?.connType === 'wan' ? 1.2 : 1;
  return Math.min(2.2, Math.max(0.6, 1 + Math.log10(mbps / 1000) * 0.6));
}

const PACKET_RADIUS: Partial<Record<ConnectionType, number>> = { fiber: 3.2, wan: 3.2, vlan: 3, wifi: 2.4, vpn: 2.8 };

/**
 * Traffic drawn on a link in presentation mode: packets travelling from the
 * source to the target along the path, or a slow dashed flow for logical
 * relations (dependencies, replication…).
 */
export function TrafficFlow({ id, path, length, color, data, bonded }: { id: string; path: string; length: number; color: string; data?: InfraEdgeData; bonded: boolean }) {
  const type = data?.connType ?? 'ethernet';
  if (type === 'arrow') return null;
  const s = seed(id);
  if (type === 'logical') {
    const dur = Math.min(8, Math.max(2.5, length / 40));
    return (
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray="2 10"
        className="flow-dash"
        style={{ animationDuration: `${dur}s`, animationDelay: `${-s * dur}s` }}
      />
    );
  }
  const dur = Math.min(7, Math.max(1.2, length / (150 * speedFactor(data))));
  // Long links and aggregates carry more than one packet at a time.
  const count = bonded ? 2 : length > 420 ? 2 : 1;
  const r = PACKET_RADIUS[type] ?? 2.8;
  return (
    <g className="traffic" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <circle key={i} r={r} fill={color} stroke="var(--canvas)" strokeWidth={1.2}>
          <animateMotion dur={`${dur}s`} repeatCount="indefinite" begin={`${-((s + i / count) % 1) * dur}s`} path={path} calcMode="linear" />
        </circle>
      ))}
    </g>
  );
}
