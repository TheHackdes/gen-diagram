import { ChevronRight, Lock } from 'lucide-react';
import { useMemo, useState } from 'react';
import { colorOf, getDefinition } from '../../data/catalog';
import { flowApi } from '../../features/canvas/flowApi';
import { useDiagram } from '../../store/diagramStore';
import type { InfraNode } from '../../types';
import { Icon } from '../icons/Icon';
import { cn } from '../ui/cn';

function focusNode(id: string) {
  useDiagram.getState().select([id]);
  const inst = flowApi.instance;
  const node = inst?.getInternalNode(id);
  if (!inst || !node) return;
  const w = node.measured.width ?? 0;
  const h = node.measured.height ?? 0;
  void inst.setCenter(node.internals.positionAbsolute.x + w / 2, node.internals.positionAbsolute.y + h / 2, {
    zoom: Math.max(inst.getZoom(), 0.9),
    duration: 350,
  });
}

function Row({ node, depth, childrenMap, collapsed, toggle }: { node: InfraNode; depth: number; childrenMap: Map<string | undefined, InfraNode[]>; collapsed: Set<string>; toggle: (id: string) => void }) {
  const def = getDefinition(node.data.type);
  const kids = childrenMap.get(node.id) ?? [];
  const isOpen = !collapsed.has(node.id);
  return (
    <>
      <div
        className={cn('group flex h-7 items-center gap-1.5 rounded-md pr-2 text-[12.5px]', node.selected ? 'bg-primary-soft text-primary' : 'text-fg hover:bg-surface-2')}
        style={{ paddingLeft: 4 + depth * 14 }}
      >
        <button
          type="button"
          aria-label={isOpen ? 'Collapse' : 'Expand'}
          onClick={() => toggle(node.id)}
          className={cn('flex h-5 w-4 items-center justify-center text-subtle', !kids.length && 'invisible')}
        >
          <ChevronRight size={12} className={cn('transition-transform', isOpen && 'rotate-90')} />
        </button>
        <button type="button" onClick={() => focusNode(node.id)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
          <span style={{ color: colorOf(def) }} className="shrink-0">
            <Icon name={def.icon} size={13} brandColor={def.icon.startsWith('brand:')} />
          </span>
          <span className="truncate">{def.kind === 'annotation' && node.data.props.text ? String(node.data.props.text) : node.data.name}</span>
          <span className="ml-auto shrink-0 text-[10px] text-subtle opacity-0 group-hover:opacity-100">{def.label}</span>
          {node.data.locked && <Lock size={10} className="shrink-0 text-subtle" />}
        </button>
      </div>
      {isOpen && kids.map((k) => <Row key={k.id} node={k} depth={depth + 1} childrenMap={childrenMap} collapsed={collapsed} toggle={toggle} />)}
    </>
  );
}

export function LayersPanel() {
  const nodes = useDiagram((s) => s.nodes);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const childrenMap = useMemo(() => {
    const m = new Map<string | undefined, InfraNode[]>();
    for (const n of nodes) m.set(n.parentId, [...(m.get(n.parentId) ?? []), n]);
    return m;
  }, [nodes]);
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const roots = childrenMap.get(undefined) ?? [];
  return (
    <div className="h-full overflow-y-auto p-2">
      {roots.length === 0 ? (
        <p className="px-3 py-8 text-center text-[12.5px] text-muted">The diagram is empty.</p>
      ) : (
        roots.map((n) => <Row key={n.id} node={n} depth={0} childrenMap={childrenMap} collapsed={collapsed} toggle={toggle} />)
      )}
    </div>
  );
}
