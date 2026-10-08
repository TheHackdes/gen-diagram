import type { NodeProps } from '@xyflow/react';
import { LayoutGrid, Lock, Rows3 } from 'lucide-react';
import { memo } from 'react';
import { colorOf, getDefinition } from '../../../data/catalog';
import { nodeIndex } from '../../../features/nodes/hierarchy';
import { useDiagram } from '../../../store/diagramStore';
import type { InfraNode } from '../../../types';
import { alpha, str } from '../../../utils/misc';
import { cn } from '../../ui/cn';
import { COMPACT_HEADER, headerHeight, hiddenAddressCount, shownAddresses } from '../../../features/nodes/ips';
import { Icon } from '../../icons/Icon';
import { useCardFields, useCompactFields, useInCompactHost } from './CompactRow';
import type { CardField } from '../../../features/nodes/groupDisplay';
import { AddressLines, CapabilityBadges, DetailLines, EditableName, IconTile, NodeHandles, OsChip, Resizer, VlanChips } from './shared';

const RUNS_ON: Record<string, string> = { vm: 'VM', physical: 'Bare metal', lxc: 'LXC' };

/** Hypervisors and Docker hosts: a header card with a body hosting guests. */
function ContainerNodeImpl({ id, data, selected, parentId }: NodeProps<InfraNode>) {
  const inCompact = useInCompactHost(parentId);
  const show = useCompactFields(parentId);
  const { setCompact } = useDiagram.getState();
  const def = getDefinition(data.type);
  const color = data.color ?? colorOf(def);
  const childCount = useDiagram((s) => nodeIndex(s.nodes).childCount.get(id) ?? 0);
  const addresses = shownAddresses(data.props);
  const joined = addresses.map((a) => a.address).join(' · ');
  const hiddenCount = hiddenAddressCount(data.props);
  const version = str(data.props.version);
  const isDocker = def.role === 'docker-host';
  // What the group around the host lets its header show (same choice as the cards).
  const fields = useCardFields(parentId);
  const has = (k: CardField) => !fields || fields.includes(k);
  const header = headerHeight({ data } as InfraNode, fields);
  const compact = data.props.compact === true;
  const meta = isDocker ? '' : `${def.label}${version ? ` ${version}` : ''}`;

  const countLabel = `${childCount} ${isDocker ? (childCount === 1 ? 'container' : 'containers') : childCount === 1 ? 'guest' : 'guests'}`;

  // Inside a compact host: a compact block (one-line header, guests as lines below).
  if (inCompact) {
    return (
      <div
        className={cn('selection-ring relative h-full w-full rounded-md border', selected ? 'border-primary ring-2 ring-primary/30' : 'border-node-line')}
        style={{ borderLeft: `3px solid ${color}`, background: `linear-gradient(${alpha(color, 0.05)}, ${alpha(color, 0.05)}), var(--canvas)` }}
      >
        <NodeHandles nodeId={id} />
        <div className="flex items-center gap-2 border-b px-2" style={{ height: COMPACT_HEADER, borderColor: alpha(color, 0.2), background: 'var(--node-bg)' }}>
          <span style={{ color }} className="shrink-0">
            <Icon name={def.icon} size={13} brandColor={def.icon.startsWith('brand:')} />
          </span>
          <EditableName id={id} value={data.name} className="max-w-[38%] min-w-0 truncate text-[12px] font-semibold text-fg" />
          {show.has('type') && isDocker && str(data.props.runsOn) && (
            <span className="shrink-0 rounded px-1 text-[9px] font-bold" style={{ background: alpha(color, 0.14), color }}>
              {RUNS_ON[str(data.props.runsOn)] ?? ''}
            </span>
          )}
          {show.has('ip') && joined && <span className="min-w-0 truncate font-mono text-[10.5px] text-muted">{joined}</span>}
          <span className="flex min-w-0 flex-1 items-center justify-end gap-1 overflow-hidden">
            {show.has('os') && <OsChip osId={data.props.os} version={data.props.osVersion} />}
            {show.has('vlan') && <VlanChips props={data.props} />}
            {show.has('services') && <CapabilityBadges props={data.props} max={2} />}
            <span className="shrink-0 text-[10px] font-medium text-muted">{countLabel}</span>
          </span>
        </div>
      </div>
    );
  }

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
        className="flex items-start gap-2.5 rounded-t-[14px] border-b px-3 pt-[8px]"
        style={{ height: header, borderColor: alpha(color, 0.25), background: 'var(--node-bg)' }}
      >
        <IconTile icon={def.icon} color={color} size={30} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="flex items-center gap-1.5">
            <EditableName id={id} value={data.name} className="truncate text-[13px] font-semibold text-fg" />
            {has('type') && isDocker && str(data.props.runsOn) && (
              <span className="shrink-0 rounded px-1 text-[9px] font-bold tracking-wide" style={{ background: alpha(color, 0.14), color }}>
                {RUNS_ON[str(data.props.runsOn)] ?? ''}
              </span>
            )}
          </div>
          <span className="flex min-w-0 items-center gap-1.5 font-mono text-[10.5px] text-muted">
            {has('subtitle') && <span className="truncate">{meta || def.label}</span>}
            {has('ip') && hiddenCount > 0 && (
              <span className="shrink-0 rounded bg-surface-2 px-1 text-[9.5px]" title="Hidden addresses — listed in the properties panel">
                +{hiddenCount} hidden
              </span>
            )}
          </span>
          {has('ip') && <AddressLines props={data.props} />}
          {has('details') && <DetailLines props={data.props} />}
        </div>
        <div className="flex shrink-0 items-center gap-1 pt-1.5">
          {has('services') && <CapabilityBadges props={data.props} max={5} />}
          {has('os') && <OsChip osId={data.props.os} version={data.props.osVersion} />}
          {has('vlan') && <VlanChips props={data.props} />}
          <span
            className="rounded-full px-1.5 py-px text-[10px] font-semibold"
            style={{ background: alpha(color, 0.12), color }}
            title={isDocker ? 'Containers' : 'Guests'}
          >
            {countLabel}
          </span>
          {childCount > 0 && (
            <button
              type="button"
              aria-pressed={compact}
              title={compact ? 'Show guests as cards' : 'Compact view: one line per guest'}
              aria-label={compact ? 'Show guests as cards' : 'Compact view'}
              onClick={(e) => {
                e.stopPropagation();
                setCompact(id, !compact);
              }}
              className={cn('no-export nodrag flex h-5 w-5 items-center justify-center rounded', compact ? 'bg-primary-soft text-primary' : 'text-subtle hover:bg-surface-2 hover:text-fg')}
            >
              {compact ? <LayoutGrid size={12} /> : <Rows3 size={12} />}
            </button>
          )}
          {data.locked && <Lock size={11} className="text-subtle" />}
        </div>
      </div>
      {childCount === 0 && (
        <div style={{ top: header }} className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center text-[11px] text-subtle">
          Drop {isDocker ? 'containers' : 'VMs, LXC or Docker hosts'} here
        </div>
      )}
    </div>
  );
}

export const ContainerNode = memo(ContainerNodeImpl);
