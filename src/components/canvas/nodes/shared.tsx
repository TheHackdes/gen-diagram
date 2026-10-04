import { Handle, NodeResizer, Position, useConnection } from '@xyflow/react';
import { useEffect, useRef, useState } from 'react';
import { getOperatingSystem } from '../../../data/operatingSystems';
import { useDiagram } from '../../../store/diagramStore';
import type { Vlan } from '../../../types';
import { alpha, str } from '../../../utils/misc';
import { Icon } from '../../icons/Icon';
import { cn } from '../../ui/cn';

const SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left];

/** Four connection points + an invisible full-node drop target while connecting. */
export function NodeHandles({ nodeId, connectable = true }: { nodeId: string; connectable?: boolean }) {
  const isTarget = useConnection((c) => c.inProgress && c.fromNode?.id !== nodeId);
  return (
    <>
      {SIDES.map((p) => (
        <Handle key={p} type="source" position={p} id={p} className="infra-handle" isConnectable={connectable} />
      ))}
      <Handle type="target" position={Position.Top} id="in" className="hidden-handle" isConnectable={false} />
      {isTarget && connectable && <Handle type="target" position={Position.Top} id="body" className="body-handle" />}
    </>
  );
}

export function Resizer({ id, selected, minWidth = 120, minHeight = 40, locked }: { id: string; selected?: boolean; minWidth?: number; minHeight?: number; locked?: boolean }) {
  const checkpoint = useDiagram((s) => s.checkpoint);
  return (
    <NodeResizer
      isVisible={!!selected && !locked}
      minWidth={minWidth}
      minHeight={minHeight}
      onResizeStart={() => checkpoint(`resize:${id}`)}
      lineClassName="no-export"
    />
  );
}

/** Double-click to rename inline. */
export function EditableName({
  id,
  value,
  className,
  field = 'name',
  multiline = false,
  placeholder,
}: {
  id: string;
  value: string;
  className?: string;
  field?: 'name' | 'text';
  multiline?: boolean;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const updateNode = useDiagram((s) => s.updateNode);
  const updateProps = useDiagram((s) => s.updateNodeProps);
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(value);
      requestAnimationFrame(() => {
        ref.current?.focus();
        ref.current?.select();
      });
    }
  }, [editing, value]);

  const commit = () => {
    setEditing(false);
    const v = draft.trim();
    if (v === value || (!v && field === 'name')) return;
    if (field === 'name') updateNode(id, { name: v });
    else updateProps(id, { text: draft });
  };

  if (editing) {
    const common = {
      ref,
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => setDraft(e.target.value),
      onBlur: commit,
      onKeyDown: (e: React.KeyboardEvent) => {
        e.stopPropagation();
        if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) commit();
        if (e.key === 'Escape') setEditing(false);
      },
      className: cn('nodrag nopan w-full rounded bg-surface px-1 outline-2 outline-primary', className),
    };
    return multiline ? <textarea {...common} rows={3} /> : <input {...common} />;
  }
  return (
    <span
      className={cn(className, !value && 'text-subtle italic')}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
    >
      {value || placeholder}
    </span>
  );
}

export function useVlan(vlanId: unknown): Vlan | undefined {
  const id = str(vlanId);
  return useDiagram((s) => (id ? s.vlans.find((v) => String(v.id) === id) : undefined));
}

export function VlanChip({ vlan, raw }: { vlan?: Vlan; raw?: string }) {
  if (!vlan && !raw) return null;
  const color = vlan?.color ?? '#64748b';
  return (
    <span
      className="inline-flex h-4 shrink-0 items-center gap-1 rounded px-1 text-[10px] font-semibold"
      style={{ background: alpha(color, 0.12), color }}
      title={vlan ? `VLAN ${vlan.id} · ${vlan.name}` : `VLAN ${raw}`}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {vlan ? vlan.id : raw}
    </span>
  );
}

export function OsChip({ osId, version }: { osId: unknown; version: unknown }) {
  const os = getOperatingSystem(osId);
  if (!os) return null;
  const v = str(version).replace(/^stream-/, 'Stream ').replace(/^leap-/, 'Leap ');
  return (
    <span className="inline-flex h-4 min-w-0 items-center gap-1 rounded bg-surface-2 px-1 text-[10px] font-medium text-muted" title={`${os.name} ${v}`}>
      <span style={{ color: os.color }} className="shrink-0">
        <Icon name={os.icon} size={10} />
      </span>
      <span className="truncate">
        {os.short}
        {v && ` ${v}`}
      </span>
    </span>
  );
}

export function IconTile({ icon, color, size = 36, osIcon, osColor }: { icon: string; color: string; size?: number; osIcon?: string; osColor?: string }) {
  const brand = icon.startsWith('brand:');
  return (
    <span
      className="relative flex shrink-0 items-center justify-center rounded-lg"
      style={{ width: size, height: size, background: alpha(color, 0.12), color }}
    >
      <Icon name={icon} size={Math.round(size * (brand ? 0.5 : 0.55))} brandColor={brand} strokeWidth={1.9} />
      {osIcon && (
        <span
          className="absolute -right-1 -bottom-1 flex h-[18px] w-[18px] items-center justify-center rounded-md border border-node-line bg-node shadow-sm"
          style={{ color: osColor }}
        >
          <Icon name={osIcon} size={11} />
        </span>
      )}
    </span>
  );
}
