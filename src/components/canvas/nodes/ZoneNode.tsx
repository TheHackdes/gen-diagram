import type { NodeProps } from '@xyflow/react';
import { Lock } from 'lucide-react';
import { memo } from 'react';
import { colorOf, getDefinition } from '../../../data/catalog';
import type { InfraNode } from '../../../types';
import { alpha, str } from '../../../utils/misc';
import { Icon } from '../../icons/Icon';
import { cn } from '../../ui/cn';
import { EditableName, NodeHandles, Resizer, useVlan } from './shared';

/** Logical areas: VLAN, subnet, network, DMZ, site, docker network, group, free zone. */
function ZoneNodeImpl({ id, data, selected }: NodeProps<InfraNode>) {
  const def = getDefinition(data.type);
  const vlan = useVlan(data.props.vlan);
  const color = data.color ?? vlan?.color ?? colorOf(def);
  const subnet = str(data.props.subnet) || vlan?.subnet || '';
  const gateway = str(data.props.gateway) || vlan?.gateway || '';
  const isGroup = data.type === 'group';
  const isArea = data.type === 'area' || data.type === 'site';

  return (
    <div
      className={cn('selection-ring relative h-full w-full rounded-2xl', selected && 'ring-2 ring-primary/30')}
      style={{
        border: `1.5px ${isGroup ? 'dotted' : isArea ? 'solid' : 'dashed'} ${selected ? 'var(--primary)' : alpha(color, isGroup ? 0.6 : 0.55)}`,
        background: isGroup ? 'transparent' : alpha(color, 0.045),
      }}
    >
      <Resizer id={id} selected={selected} minWidth={160} minHeight={80} locked={data.locked} />
      <NodeHandles nodeId={id} />
      <div className="absolute top-3 right-3 left-3.5 flex min-w-0 items-center gap-2">
        {vlan ? (
          <span className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold text-white" style={{ background: color }}>
            VLAN {vlan.id}
          </span>
        ) : (
          <span style={{ color }} className="shrink-0">
            <Icon name={def.icon} size={14} brandColor={def.icon.startsWith('brand:')} />
          </span>
        )}
        <span className="min-w-0 truncate" style={{ color }}>
          <EditableName
            id={id}
            value={data.name}
            className={cn('font-semibold tracking-wide uppercase', isGroup ? 'text-[11px]' : 'text-[12px]')}
          />
        </span>
        {subnet && <span className="shrink-0 font-mono text-[11px] text-muted">{subnet}</span>}
        <span className="flex-1" />
        {gateway && <span className="hidden shrink-0 font-mono text-[10.5px] text-subtle sm:inline">gw {gateway}</span>}
        {data.locked && <Lock size={11} className="shrink-0 text-subtle" />}
      </div>
    </div>
  );
}

export const ZoneNode = memo(ZoneNodeImpl);
