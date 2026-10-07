import {
  BringToFront,
  ClipboardPaste,
  Columns3,
  Copy,
  CopyPlus,
  Grid3x3,
  Group,
  List,
  Lock,
  LockOpen,
  LayoutGrid,
  Rows3,
  Link2,
  LogOut,
  Maximize,
  Move,
  Plus,
  Scissors,
  SendToBack,
  Spline,
  StickyNote,
  Trash,
  Ungroup,
  Wand2,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getDefinition, getPreset } from '../../data/catalog';
import { fitDiagram } from '../../features/canvas/flowApi';
import { ARRANGE_MODES, arrangementOf, canArrange, canCompact, type ArrangeMode } from '../../features/nodes/arrange';
import { parallelEdges } from '../../features/connections/parallel';
import { useDiagram } from '../../store/diagramStore';
import { useUi } from '../../store/uiStore';
import { modKey } from '../../utils/misc';
import { Icon } from '../icons/Icon';
import { MenuList, type MenuEntry } from '../ui/Menu';

export function ContextMenu() {
  const menu = useUi((s) => s.contextMenu);
  const close = () => useUi.getState().setContextMenu(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('wheel', close, { passive: true });
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('wheel', close);
    };
  }, [menu]);

  if (!menu) return null;
  const st = useDiagram.getState();
  const items: MenuEntry[] = [];

  if (menu.nodeId) {
    const node = st.nodes.find((n) => n.id === menu.nodeId);
    if (node) {
      const def = getDefinition(node.data.type);
      const selectedIds = st.nodes.filter((n) => n.selected).map((n) => n.id);
      const ids = selectedIds.includes(node.id) ? selectedIds : [node.id];
      if (def.quickAdd?.length) {
        items.push({ heading: `Add to ${node.data.name}` });
        for (const type of def.quickAdd) {
          const p = getPreset(type);
          items.push({
            id: `add-${type}`,
            label: p?.label ?? type,
            icon: <Icon name={getDefinition(type).icon} size={14} />,
            onSelect: () => st.addChild(node.id, type),
          });
        }
        items.push('separator');
      }
      items.push(
        { id: 'dup', label: 'Duplicate', icon: <CopyPlus size={14} />, shortcut: `${modKey}D`, onSelect: () => (st.select(ids), st.duplicateSelection()) },
        { id: 'copy', label: 'Copy', icon: <Copy size={14} />, shortcut: `${modKey}C`, onSelect: () => (st.select(ids), st.copySelection()) },
        { id: 'cut', label: 'Cut', icon: <Scissors size={14} />, shortcut: `${modKey}X`, onSelect: () => (st.select(ids), st.cutSelection()) },
        'separator',
        { id: 'group', label: 'Group selection', icon: <Group size={14} />, shortcut: `${modKey}G`, onSelect: () => (st.select(ids), st.groupSelection()) },
      );
      if (canCompact(node) && st.nodes.some((n) => n.parentId === node.id)) {
        const compact = node.data.props.compact === true;
        const cards = def.kind === 'container' ? 'Show guests as cards' : 'Show members as cards';
        items.push({ id: 'compact', label: compact ? cards : 'Compact view', icon: compact ? <LayoutGrid size={14} /> : <Rows3 size={14} />, onSelect: () => st.setCompact(node.id, !compact) });
      }
      if (canArrange(node)) {
        const current = arrangementOf(node).mode;
        const icons: Record<ArrangeMode, React.ReactNode> = { free: <Move size={14} />, list: <List size={14} />, row: <Columns3 size={14} />, grid: <Grid3x3 size={14} /> };
        items.push('separator', { heading: 'Arrange members' });
        for (const m of ARRANGE_MODES)
          items.push({ id: `arrange-${m.value}`, label: m.label, description: m.title, icon: icons[m.value], checked: current === m.value, onSelect: () => st.updateNodeProps(node.id, { arrange: m.value }) });
        items.push('separator');
      }
      if (def.accepts && st.nodes.some((n) => n.parentId === node.id)) {
        items.push({ id: 'ungroup', label: def.type === 'group' ? 'Ungroup' : 'Release children', icon: <Ungroup size={14} />, shortcut: `${modKey}⇧G`, onSelect: () => st.ungroup(node.id) });
      }
      if (node.parentId) {
        items.push({ id: 'detach', label: 'Move out of container', icon: <LogOut size={14} />, onSelect: () => st.detachFromParent(node.id) });
      }
      items.push(
        { id: 'front', label: 'Bring to front', icon: <BringToFront size={14} />, onSelect: () => st.bringToFront(ids) },
        { id: 'back', label: 'Send to back', icon: <SendToBack size={14} />, onSelect: () => st.sendToBack(ids) },
        {
          id: 'lock',
          label: node.data.locked ? 'Unlock' : 'Lock',
          icon: node.data.locked ? <LockOpen size={14} /> : <Lock size={14} />,
          shortcut: `${modKey}L`,
          onSelect: () => st.toggleLock(ids),
        },
        'separator',
        { id: 'delete', label: 'Delete', icon: <Trash size={14} />, shortcut: 'Del', danger: true, disabled: !!node.data.locked, onSelect: () => st.deleteElements(ids) },
      );
    }
  } else if (menu.edgeId) {
    const edgeId = menu.edgeId;
    items.push(
      { id: 'parallel', label: 'Add parallel link', icon: <Plus size={14} />, onSelect: () => st.addParallelLink(edgeId) },
      (() => {
        const edge = st.edges.find((e) => e.id === edgeId);
        const inBond = !!edge?.data?.bondId;
        return inBond
          ? { id: 'unbond', label: 'Remove from bond', icon: <Link2 size={14} />, onSelect: () => st.removeFromBond([edgeId]) }
          : {
              id: 'bond',
              label: 'Create bond',
              icon: <Link2 size={14} />,
              onSelect: () => {
                const parallel = edge ? parallelEdges(st.edges, edge).filter((e) => !e.data?.bondId).map((e) => e.id) : [edgeId];
                st.createBond(parallel.length ? parallel : [edgeId]);
              },
            };
      })(),
      { id: 'reverse', label: 'Reverse direction', icon: <Spline size={14} />, onSelect: () => st.reverseEdge(edgeId) },
      'separator',
      { id: 'delete', label: 'Delete link', icon: <Trash size={14} />, danger: true, onSelect: () => st.deleteElements([], [edgeId]) },
    );
  } else {
    items.push(
      { id: 'paste', label: 'Paste here', icon: <ClipboardPaste size={14} />, shortcut: `${modKey}V`, disabled: !st.clipboard, onSelect: () => st.paste(menu.flow) },
      { id: 'note', label: 'Add note', icon: <StickyNote size={14} />, onSelect: () => st.addNode('note', menu.flow) },
      { id: 'text', label: 'Add text', icon: <Plus size={14} />, onSelect: () => st.addNode('text', menu.flow) },
      'separator',
      { id: 'layout', label: 'Auto layout', icon: <Wand2 size={14} />, onSelect: () => st.applyLayout('network') },
      { id: 'fit', label: 'Fit to screen', icon: <Maximize size={14} />, shortcut: '⇧1', onSelect: () => fitDiagram() },
      { id: 'all', label: 'Select all', shortcut: `${modKey}A`, onSelect: () => st.selectAll() },
    );
  }

  const left = Math.min(menu.x, window.innerWidth - 240);
  const top = Math.min(menu.y, window.innerHeight - Math.min(items.length * 32 + 16, window.innerHeight - 16));
  return createPortal(
    <div ref={ref} className="fixed z-[900]" style={{ left, top }} onContextMenu={(e) => e.preventDefault()}>
      <MenuList items={items} onClose={close} />
    </div>,
    document.body,
  );
}
