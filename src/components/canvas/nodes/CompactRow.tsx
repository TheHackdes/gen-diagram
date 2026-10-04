import { Lock } from 'lucide-react';
import { colorOf, getDefinition } from '../../../data/catalog';
import { extraIps } from '../../../features/nodes/ips';
import { useDiagram } from '../../../store/diagramStore';
import type { InfraNode } from '../../../types';
import { alpha, str } from '../../../utils/misc';
import { Icon } from '../../icons/Icon';
import { cn } from '../../ui/cn';
import { CapabilityBadges, EditableName, NodeHandles, OsChip, useVlan, VlanChip } from './shared';

/** Is a node (through its parents) inside a host shown in compact view? */
export function useInCompactHost(parentId: string | undefined): boolean {
  return useDiagram((s) => {
    let pid = parentId;
    let guard = 0;
    while (pid && guard++ < 20) {
      const p = s.nodes.find((n) => n.id === pid);
      if (!p) return false;
      if (p.data.props.compact === true) return true;
      pid = p.parentId;
    }
    return false;
  });
}

const SHORT_TYPE: Record<string, string> = { 'docker-container': 'CT', 'docker-host': 'Docker', bridge: 'Bridge', storage: 'Storage' };

/**
 * A guest drawn as one line in a compact host: only what identifies it —
 * name, type, address, OS (or image), VLAN and active services.
 */
export function CompactRow({ id, data, selected }: { id: string; data: InfraNode['data']; selected?: boolean }) {
  const def = getDefinition(data.type);
  const color = data.color ?? colorOf(def);
  const vlan = useVlan(data.props.vlan);
  const ip = str(data.props.ip);
  const more = extraIps(data.props).length;
  const docker = def.role === 'docker-container';
  const image = str(data.props.image);
  const tag = str(data.props.tag);
  const badge = def.badge ?? SHORT_TYPE[data.type];
  return (
    <div
      className={cn(
        'selection-ring relative flex h-full w-full items-center gap-2 rounded-md border bg-node pr-2 pl-2',
        selected ? 'border-primary ring-2 ring-primary/30' : 'border-node-line',
        def.role === 'lxc' && !selected && 'border-dashed',
      )}
      style={{ borderLeft: `3px solid ${color}` }}
      title={[data.name, ip, str(data.props.description)].filter(Boolean).join(' · ')}
    >
      <NodeHandles nodeId={id} />
      <span style={{ color }} className="shrink-0">
        <Icon name={def.icon} size={13} brandColor={def.icon.startsWith('brand:')} />
      </span>
      <EditableName id={id} value={data.name} className="max-w-[38%] min-w-0 shrink truncate text-[12px] font-semibold text-fg" />
      {badge && (
        <span className="shrink-0 rounded px-1 text-[9px] font-bold" style={{ background: alpha(color, 0.14), color }}>
          {badge}
        </span>
      )}
      {ip && (
        <span className="shrink-0 font-mono text-[10.5px] text-muted">
          {ip}
          {more > 0 && <span className="ml-1 font-sans text-[9.5px] text-subtle">+{more}</span>}
        </span>
      )}
      <span className="flex min-w-0 flex-1 items-center justify-end gap-1 overflow-hidden">
        {docker ? (
          image && <span className="truncate font-mono text-[10px] text-muted">{image}{tag ? `:${tag}` : ''}</span>
        ) : (
          <OsChip osId={data.props.os} version={data.props.osVersion} />
        )}
        <VlanChip vlan={vlan} raw={docker ? '' : str(data.props.vlan)} />
        <CapabilityBadges props={data.props} max={2} />
      </span>
      {data.locked && <Lock size={10} className="shrink-0 text-subtle" />}
    </div>
  );
}
