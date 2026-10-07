import type { NodeProps } from '@xyflow/react';
import { LayoutGrid, Lock, Rows3 } from 'lucide-react';
import { memo } from 'react';
import { colorOf, getDefinition } from '../../../data/catalog';
import { isArranged } from '../../../features/nodes/arrange';
import { headerFieldsOf, type HeaderField } from '../../../features/nodes/groupDisplay';
import { nodeIndex } from '../../../features/nodes/hierarchy';
import { COMPACT_HEADER } from '../../../features/nodes/ips';
import { useDiagram } from '../../../store/diagramStore';
import type { InfraNode } from '../../../types';
import { alpha, str } from '../../../utils/misc';
import { Icon } from '../../icons/Icon';
import { cn } from '../../ui/cn';
import { useCompactFields, useInCompactHost } from './CompactRow';
import { EditableName, NodeHandles, Resizer, useVlan } from './shared';

/** Logical areas: VLAN, subnet, network, DMZ, site, docker network, group, free zone. */
function ZoneNodeImpl({ id, data, selected, parentId }: NodeProps<InfraNode>) {
  const def = getDefinition(data.type);
  const vlan = useVlan(data.props.vlan);
  const inCompact = useInCompactHost(parentId);
  const show = useCompactFields(parentId);
  const childCount = useDiagram((s) => nodeIndex(s.nodes).childCount.get(id) ?? 0);
  const { setCompact } = useDiagram.getState();
  const color = data.color ?? vlan?.color ?? colorOf(def);
  const subnet = str(data.props.subnet) || vlan?.subnet || '';
  const gateway = str(data.props.gateway) || vlan?.gateway || '';
  const isGroup = data.type === 'group';
  const isArea = data.type === 'area' || data.type === 'site';
  const compact = data.props.compact === true;
  const accepts = def.accepts !== undefined;
  const fields = headerFieldsOf({ data } as InfraNode);
  const head = (k: HeaderField) => fields.includes(k);
  const description = head('description') ? str(data.props.description) : '';
  const countLabel = `${childCount} ${childCount === 1 ? 'item' : 'items'}`;
  const badge = vlan && head('vlan') ? (
    <span className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold text-white" style={{ background: color }}>
      VLAN {vlan.id}
    </span>
  ) : head('icon') ? (
    <span style={{ color }} className="shrink-0">
      <Icon name={def.icon} size={14} brandColor={def.icon.startsWith('brand:')} />
    </span>
  ) : null;

  // Inside a compact host: a compact block (one-line header, members as lines below).
  if (inCompact) {
    return (
      <div
        className={cn('selection-ring relative h-full w-full rounded-md border border-dashed', selected ? 'border-primary ring-2 ring-primary/30' : 'border-node-line')}
        style={{ borderLeft: `3px solid ${color}`, background: alpha(color, 0.045) }}
      >
        <NodeHandles nodeId={id} />
        <div className="flex items-center gap-2 border-b px-2" style={{ height: COMPACT_HEADER, borderColor: alpha(color, 0.2) }}>
          {badge}
          {head('name') && (
            <span className="max-w-[45%] min-w-0 truncate" style={{ color }}>
              <EditableName id={id} value={data.name} className="text-[12px] font-semibold" />
            </span>
          )}
          {head('subnet') && show.has('ip') && subnet && <span className="min-w-0 truncate font-mono text-[10.5px] text-muted">{subnet}</span>}
          {description && <span className="min-w-0 truncate text-[10.5px] text-subtle">{description}</span>}
          <span className="flex-1" />
          <span className="shrink-0 text-[10px] font-medium text-muted">{countLabel}</span>
          {data.locked && <Lock size={10} className="shrink-0 text-subtle" />}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn('selection-ring relative h-full w-full rounded-2xl', selected && 'ring-2 ring-primary/30')}
      style={{
        border: `1.5px ${isGroup ? 'dotted' : isArea ? 'solid' : 'dashed'} ${selected ? 'var(--primary)' : alpha(color, isGroup ? 0.6 : 0.55)}`,
        background: isGroup ? 'transparent' : alpha(color, 0.045),
      }}
    >
      {/* Arranged groups size themselves to their members; compact ones keep a free width. */}
      <Resizer id={id} selected={selected} minWidth={160} minHeight={80} locked={data.locked || (isArranged({ data } as InfraNode) && !compact)} />
      <NodeHandles nodeId={id} />
      <div className="absolute top-3 right-3 left-3.5 flex min-w-0 items-center gap-2">
        {badge}
        {head('name') && (
          <span className="min-w-0 truncate" style={{ color }}>
            <EditableName
              id={id}
              value={data.name}
              className={cn('font-semibold', isGroup ? 'text-[12px]' : 'text-[13px]')}
            />
          </span>
        )}
        {head('subnet') && subnet && <span className="shrink-0 font-mono text-[11px] text-muted">{subnet}</span>}
        {description && <span className="min-w-0 truncate text-[11px] text-subtle">{description}</span>}
        <span className="flex-1" />
        {head('gateway') && gateway && <span className="hidden shrink-0 font-mono text-[10.5px] text-subtle sm:inline">gw {gateway}</span>}
        {head('count') && (
          <span className="shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold" style={{ background: alpha(color, 0.12), color }}>
            {countLabel}
          </span>
        )}
        {accepts && childCount > 0 && (
          <button
            type="button"
            aria-pressed={compact}
            title={compact ? 'Show members as cards' : 'Compact view: one line per member'}
            aria-label={compact ? 'Show members as cards' : 'Compact view'}
            onClick={(e) => {
              e.stopPropagation();
              setCompact(id, !compact);
            }}
            className={cn('no-export nodrag flex h-5 w-5 shrink-0 items-center justify-center rounded', compact ? 'bg-primary-soft text-primary' : 'text-subtle hover:bg-surface-2 hover:text-fg')}
          >
            {compact ? <LayoutGrid size={12} /> : <Rows3 size={12} />}
          </button>
        )}
        {data.locked && <Lock size={11} className="shrink-0 text-subtle" />}
      </div>
    </div>
  );
}

export const ZoneNode = memo(ZoneNodeImpl);
