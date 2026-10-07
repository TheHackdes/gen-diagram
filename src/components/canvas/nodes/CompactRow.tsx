import { Lock } from 'lucide-react';
import { colorOf, getDefinition } from '../../../data/catalog';
import { shownAddresses } from '../../../features/nodes/ips';
import { useDiagram } from '../../../store/diagramStore';
import { compactFieldsOf, compactHostAbove, type CompactField } from '../../../features/nodes/compact';
import { nodeIndex } from '../../../features/nodes/hierarchy';
import type { InfraNode } from '../../../types';
import { alpha, str } from '../../../utils/misc';
import { Icon } from '../../icons/Icon';
import { cn } from '../../ui/cn';
import { CapabilityBadges, EditableName, NodeHandles, OsChip, VlanChips } from './shared';

/** Is a node (through its parents) inside a host shown in compact view? */
export function useInCompactHost(parentId: string | undefined): boolean {
  return useDiagram((s) => {
    const { byId } = nodeIndex(s.nodes);
    let pid = parentId;
    let guard = 0;
    while (pid && guard++ < 20) {
      const p = byId.get(pid);
      if (!p) return false;
      if (p.data.props.compact === true) return true;
      pid = p.parentId;
    }
    return false;
  });
}

const SHORT_TYPE: Record<string, string> = { 'docker-container': 'CT', 'docker-host': 'Docker', bridge: 'Bridge', storage: 'Storage' };

/** Fields chosen on the compact host above this node (stable string for the store selector). */
export function useCompactFields(parentId: string | undefined): Set<CompactField> {
  const key = useDiagram((s) => compactFieldsOf(compactHostAbove(parentId, s.nodes)).join(','));
  return new Set(key ? (key.split(',') as CompactField[]) : []);
}

function resources(props: Record<string, unknown>): string {
  const cpu = str(props.vcpu) || str(props.cores);
  const ram = str(props.ram);
  return [cpu && `${cpu} vCPU`, ram].filter(Boolean).join(' · ');
}

/**
 * A guest drawn as one line in a compact host, showing only the information
 * chosen on the host (name is always shown).
 */
export function CompactRow({ id, data, selected, parentId }: { id: string; data: InfraNode['data']; selected?: boolean; parentId?: string }) {
  const def = getDefinition(data.type);
  const color = data.color ?? colorOf(def);
  const show = useCompactFields(parentId);
  const addresses = shownAddresses(data.props).map((a) => a.address).join(' · ');
  const docker = def.role === 'docker-container';
  const image = str(data.props.image);
  const tag = str(data.props.tag);
  const ports = str(data.props.ports);
  const hostname = str(data.props.hostname);
  const res = resources(data.props);
  const description = str(data.props.description);
  const badge = def.badge ?? SHORT_TYPE[data.type];
  return (
    <div
      className={cn(
        'selection-ring relative flex h-full w-full items-center gap-2 rounded-md border bg-node pr-2 pl-2',
        selected ? 'border-primary ring-2 ring-primary/30' : 'border-node-line',
        def.role === 'lxc' && !selected && 'border-dashed',
      )}
      style={{ borderLeft: `3px solid ${color}` }}
      title={[data.name, addresses, description].filter(Boolean).join(' · ')}
    >
      <NodeHandles nodeId={id} />
      <span style={{ color }} className="shrink-0">
        <Icon name={def.icon} size={13} brandColor={def.icon.startsWith('brand:')} />
      </span>
      <EditableName id={id} value={data.name} className="max-w-[38%] min-w-0 shrink truncate text-[12px] font-semibold text-fg" />
      {show.has('type') && badge && (
        <span className="shrink-0 rounded px-1 text-[9px] font-bold" style={{ background: alpha(color, 0.14), color }}>
          {badge}
        </span>
      )}
      {show.has('ip') && addresses && <span className="min-w-0 shrink truncate font-mono text-[10.5px] text-muted">{addresses}</span>}
      {show.has('hostname') && hostname && <span className="min-w-0 shrink truncate font-mono text-[10px] text-subtle">{hostname}</span>}
      {show.has('resources') && res && <span className="shrink-0 text-[10px] text-muted">{res}</span>}
      <span className="min-w-0 flex-1 truncate text-[10.5px] text-subtle">{show.has('description') ? description : ''}</span>
      <span className="flex min-w-0 shrink items-center justify-end gap-1 overflow-hidden">
        {show.has('os') &&
          (docker ? (
            image && <span className="truncate font-mono text-[10px] text-muted">{image}{tag ? `:${tag}` : ''}</span>
          ) : (
            <OsChip osId={data.props.os} version={data.props.osVersion} />
          ))}
        {show.has('ports') && ports && <span className="shrink-0 rounded bg-surface-2 px-1 font-mono text-[9.5px] text-muted">{ports}</span>}
        {show.has('vlan') && !docker && <VlanChips props={data.props} max={2} />}
        {show.has('services') && <CapabilityBadges props={data.props} max={2} />}
      </span>
      {data.locked && <Lock size={10} className="shrink-0 text-subtle" />}
    </div>
  );
}
