import type { NodeProps } from '@xyflow/react';
import { Lock } from 'lucide-react';
import { memo } from 'react';
import { colorOf, getDefinition } from '../../../data/catalog';
import { getOperatingSystem } from '../../../data/operatingSystems';
import type { InfraNode } from '../../../types';
import { alpha, str } from '../../../utils/misc';
import { cn } from '../../ui/cn';
import { useStore } from '@xyflow/react';
import { lowDetailCards } from '../../../features/canvas/lod';
import { CompactRow, useCardFields, useInCompactHost } from './CompactRow';
import type { CardField } from '../../../features/nodes/groupDisplay';
import { hasBadges, hiddenAddressCount, requiredHeight, shownAddresses } from '../../../features/nodes/ips';
import { AddressLines, CapabilityBadges, DetailLines, EditableName, IconTile, NodeHandles, OsChip, Resizer, useVlan, VlanChips } from './shared';

function DeviceNodeImpl({ id, data, selected, parentId }: NodeProps<InfraNode>) {
  const compact = useInCompactHost(parentId);
  const fields = useCardFields(parentId);
  // What the group around the card lets it show.
  const has = (k: CardField) => !fields || fields.includes(k);
  const simple = useStore((s) => lowDetailCards(s.transform[2]));
  const def = getDefinition(data.type);
  const color = data.color ?? colorOf(def);
  const os = getOperatingSystem(data.props.os);
  const vlan = useVlan(data.props.vlan);
  // All displayed addresses, alike (no "main" one).
  const addresses = shownAddresses(data.props);
  const hiddenIps = hiddenAddressCount(data.props);
  const isDocker = def.role === 'docker-container';
  const isLxc = def.role === 'lxc';

  if (compact) return <CompactRow id={id} data={data} selected={selected} parentId={parentId} />;

  // Level of detail (large diagrams, zoomed out): icon and name only.
  if (simple) {
    return (
      <div
        key="simple"
        className={cn('selection-ring relative flex h-full w-full items-center gap-2 rounded-xl border bg-node px-2.5', selected ? 'border-primary ring-2 ring-primary/30' : 'border-node-line')}
        style={{ borderLeftWidth: 3, borderLeftStyle: 'solid', borderLeftColor: color }}
      >
        <NodeHandles nodeId={id} />
        <IconTile icon={def.icon} color={color} size={isDocker ? 28 : 36} />
        <span className="min-w-0 truncate text-[15px] font-semibold text-fg">{data.name}</span>
      </div>
    );
  }

  if (isDocker) {
    const image = str(data.props.image);
    const tag = str(data.props.tag);
    const ports = str(data.props.ports);
    return (
      <div
        key="docker"
        className={cn(
          'selection-ring relative flex h-full w-full items-center gap-2 rounded-lg border bg-node px-2 transition-shadow',
          selected ? 'border-primary ring-2 ring-primary/30' : 'border-node-line',
        )}
        style={{ boxShadow: 'var(--node-shadow)', borderLeftWidth: 3, borderLeftStyle: 'solid', borderLeftColor: color }}
      >
        <Resizer id={id} selected={selected} minWidth={120} minHeight={40} locked={data.locked} />
        <NodeHandles nodeId={id} />
        <IconTile icon={def.icon} color={color} size={28} />
        <div className="min-w-0 flex-1 leading-tight">
          <EditableName id={id} value={data.name} className="block truncate text-[12px] font-semibold text-fg" />
          <span className="block truncate font-mono text-[10px] text-muted">
            {(has('os') && image ? `${image}${tag ? `:${tag}` : ''}` : has('ip') && addresses.map((a) => a.address).join(' · ')) || 'container'}
          </span>
        </div>
        {has('ip') && has('os') && image && addresses.length > 1 && (
          <span className="shrink-0 rounded bg-surface-2 px-1 font-mono text-[9px] text-muted" title={addresses.map((a) => a.address).join(', ')}>
            {addresses.length} IP
          </span>
        )}
        {has('ports') && ports && (
          <span className="shrink-0 rounded bg-surface-2 px-1 font-mono text-[9px] text-muted" title={ports}>
            :{ports.split(',')[0].split(':')[0].trim()}
            {ports.includes(',') && '+'}
          </span>
        )}
        {data.locked && <Lock size={10} className="absolute top-1 right-1 text-subtle" />}
      </div>
    );
  }

  const subtitle = str(data.props.role) || str(data.props.product) || def.label;
  const badges = has('services') && hasBadges(data.props);
  const showVlan = has('vlan') && (!!vlan || !!str(data.props.vlan) || addresses.some((a) => a.vlan));
  const showOs = has('os') && !!os;
  const minHeight = requiredHeight({ data } as InfraNode, fields) - 16;

  return (
    <div
      key="full"
      className={cn(
        'selection-ring relative flex h-full w-full items-center gap-2.5 rounded-xl border bg-node px-2.5 transition-shadow',
        isLxc && 'border-dashed',
        selected ? 'border-primary ring-2 ring-primary/30' : 'border-node-line',
      )}
      style={{
        boxShadow: 'var(--node-shadow)',
        borderColor: !selected && (isLxc || def.badge) ? alpha(color, 0.55) : undefined,
        borderWidth: isLxc ? 1.5 : undefined,
      }}
    >
      <Resizer id={id} selected={selected} minWidth={140} minHeight={Math.max(48, minHeight)} locked={data.locked} />
      <NodeHandles nodeId={id} />
      <IconTile
        icon={def.icon}
        color={color}
        osIcon={showOs && def.role !== 'endpoint' ? os.icon : undefined}
        osColor={os?.color}
      />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="flex items-center gap-1.5">
          <EditableName id={id} value={data.name} className="min-w-0 truncate text-[13px] font-semibold text-fg" />
          {has('ip') && hiddenIps > 0 && (
            <span className="shrink-0 rounded bg-surface-2 px-1 text-[9.5px] text-subtle" title={`${hiddenIps} hidden address${hiddenIps > 1 ? 'es' : ''} — listed in the properties panel`}>
              +{hiddenIps} IP
            </span>
          )}
          {has('type') && def.badge && (
            <span
              className="shrink-0 rounded px-1 text-[9px] font-bold tracking-wide"
              style={{ background: alpha(color, 0.14), color }}
            >
              {def.badge}
            </span>
          )}
        </div>
        {has('ip') && addresses.length ? (
          <AddressLines props={data.props} />
        ) : (
          has('subtitle') && <span className="block truncate text-[11px] text-muted">{subtitle}</span>
        )}
        {has('details') && <DetailLines props={data.props} />}
        {(showVlan || showOs) && (
          <div className="mt-1 flex min-w-0 items-center gap-1 overflow-hidden">
            {showVlan && <VlanChips props={data.props} />}
            {showOs && <OsChip osId={data.props.os} version={data.props.osVersion} />}
          </div>
        )}
        {badges && (
          <div className="mt-1 flex min-w-0 items-center gap-1 overflow-hidden">
            <CapabilityBadges props={data.props} max={4} />
          </div>
        )}
      </div>
      {data.locked && <Lock size={11} className="absolute top-1.5 right-1.5 text-subtle" />}
    </div>
  );
}

export const DeviceNode = memo(DeviceNodeImpl);
