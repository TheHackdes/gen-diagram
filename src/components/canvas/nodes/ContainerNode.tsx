import type { NodeProps } from '@xyflow/react';
import { Lock } from 'lucide-react';
import { memo } from 'react';
import { colorOf, getDefinition } from '../../../data/catalog';
import { useDiagram } from '../../../store/diagramStore';
import type { InfraNode } from '../../../types';
import { alpha, str } from '../../../utils/misc';
import { cn } from '../../ui/cn';
import { EditableName, IconTile, NodeHandles, OsChip, Resizer, useVlan, VlanChip } from './shared';

const RUNS_ON: Record<string, string> = { vm: 'VM', physical: 'Bare metal', lxc: 'LXC' };

/** Hypervisors and Docker hosts: a header card with a body hosting guests. */
function ContainerNodeImpl({ id, data, selected }: NodeProps<InfraNode>) {
  const def = getDefinition(data.type);
  const color = data.color ?? colorOf(def);
  const vlan = useVlan(data.props.vlan);
  const childCount = useDiagram((s) => s.nodes.reduce((acc, n) => acc + (n.parentId === id ? 1 : 0), 0));
  const ip = str(data.props.ip);
  const version = str(data.props.version);
  const isDocker = def.role === 'docker-host';
  const meta = [isDocker ? null : `${def.label}${version ? ` ${version}` : ''}`, ip].filter(Boolean).join(' · ');

  return (
    <div
      className={cn(
        'selection-ring relative h-full w-full rounded-2xl border-[1.5px] transition-shadow',
        selected && 'ring-2 ring-primary/30',
      )}
      style={{
        borderColor: selected ? 'var(--primary)' : alpha(color, 0.45),
        background: `linear-gradient(${alpha(color, 0.05)}, ${alpha(color, 0.05)}), var(--canvas)`,
        boxShadow: 'var(--node-shadow)',
      }}
    >
      <Resizer id={id} selected={selected} minWidth={240} minHeight={120} locked={data.locked} />
      <NodeHandles nodeId={id} />
      <div
        className="flex h-[48px] items-center gap-2.5 rounded-t-[14px] border-b px-3"
        style={{ borderColor: alpha(color, 0.25), background: 'var(--node-bg)' }}
      >
        <IconTile icon={def.icon} color={color} size={30} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="flex items-center gap-1.5">
            <EditableName id={id} value={data.name} className="truncate text-[13px] font-semibold text-fg" />
            {isDocker && str(data.props.runsOn) && (
              <span className="shrink-0 rounded px-1 text-[9px] font-bold tracking-wide" style={{ background: alpha(color, 0.14), color }}>
                {RUNS_ON[str(data.props.runsOn)] ?? ''}
              </span>
            )}
          </div>
          <span className="block truncate font-mono text-[10.5px] text-muted">{meta || def.label}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <OsChip osId={data.props.os} version={data.props.osVersion} />
          <VlanChip vlan={vlan} raw={str(data.props.vlan)} />
          <span
            className="rounded-full px-1.5 py-px text-[10px] font-semibold"
            style={{ background: alpha(color, 0.12), color }}
            title={isDocker ? 'Containers' : 'Guests'}
          >
            {childCount} {isDocker ? (childCount === 1 ? 'container' : 'containers') : childCount === 1 ? 'guest' : 'guests'}
          </span>
          {data.locked && <Lock size={11} className="text-subtle" />}
        </div>
      </div>
      {childCount === 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-[48px] bottom-0 flex items-center justify-center text-[11px] text-subtle">
          Drop {isDocker ? 'containers' : 'VMs, LXC or Docker hosts'} here
        </div>
      )}
    </div>
  );
}

export const ContainerNode = memo(ContainerNodeImpl);
