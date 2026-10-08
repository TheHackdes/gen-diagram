import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  CopyPlus,
  Group,
  Link2,
  Lock,
  Trash,
} from 'lucide-react';
import { modeInfo, suggestBondMode } from '../../features/connections/bonds';
import { useDiagram } from '../../store/diagramStore';
import type { InfraNode } from '../../types';
import { modKey } from '../../utils/misc';
import { Button, IconButton } from '../ui/Button';
import { Section } from './NodeProperties';

export function MultiProperties({ nodes, edgeIds }: { nodes: InfraNode[]; edgeIds: string[] }) {
  const st = useDiagram.getState();
  const edgeCount = edgeIds.length;
  // The mode the bond will start with, valid for these links.
  const bondMode = useDiagram((s) => {
    const members = s.edges.filter((e) => edgeIds.includes(e.id) && e.data?.connType !== 'arrow');
    return members.length ? modeInfo(suggestBondMode(members, s.nodes)).label : '';
  });
  const ids = nodes.map((n) => n.id);
  return (
    <div>
      <div className="border-b border-line px-4 py-4">
        <div className="text-[12px] font-medium text-muted">Selection</div>
        <div className="text-[15px] font-semibold text-fg">
          {nodes.length} element{nodes.length !== 1 ? 's' : ''}
          {edgeCount > 0 && `, ${edgeCount} link${edgeCount !== 1 ? 's' : ''}`}
        </div>
      </div>
      {nodes.length >= 2 && (
        <Section title="Align">
          <div className="flex flex-wrap gap-1">
            <IconButton label="Align left" onClick={() => st.align('left')}><AlignStartVertical size={16} /></IconButton>
            <IconButton label="Align centers horizontally" onClick={() => st.align('center')}><AlignCenterVertical size={16} /></IconButton>
            <IconButton label="Align right" onClick={() => st.align('right')}><AlignEndVertical size={16} /></IconButton>
            <IconButton label="Align top" onClick={() => st.align('top')}><AlignStartHorizontal size={16} /></IconButton>
            <IconButton label="Align middles" onClick={() => st.align('middle')}><AlignCenterHorizontal size={16} /></IconButton>
            <IconButton label="Align bottom" onClick={() => st.align('bottom')}><AlignEndHorizontal size={16} /></IconButton>
            <span className="mx-1 w-px self-stretch bg-line" />
            <IconButton label="Distribute horizontally" disabled={nodes.length < 3} onClick={() => st.distribute('horizontal')}><AlignHorizontalDistributeCenter size={16} /></IconButton>
            <IconButton label="Distribute vertically" disabled={nodes.length < 3} onClick={() => st.distribute('vertical')}><AlignVerticalDistributeCenter size={16} /></IconButton>
          </div>
        </Section>
      )}
      {edgeIds.length >= 2 && (
        <Section title="Links">
          <p className="mb-2 text-[11.5px] leading-snug text-subtle">Selected links can form one bond, even towards different devices (MLAG, stack, vPC).</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="primary" icon={<Link2 size={14} />} onClick={() => st.createBond(edgeIds)}>
              Bond {edgeIds.length} links
            </Button>
            <span className="text-[11px] text-subtle">
              Mode: <span className="font-medium text-muted">{bondMode}</span>
            </span>
          </div>
        </Section>
      )}
      <Section title="Actions">
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" icon={<Group size={14} />} onClick={() => st.groupSelection()} disabled={!nodes.length}>
            Group <span className="text-[11px] text-subtle">{modKey}G</span>
          </Button>
          <Button size="sm" icon={<CopyPlus size={14} />} onClick={() => st.duplicateSelection()} disabled={!nodes.length}>
            Duplicate
          </Button>
          <Button size="sm" icon={<Lock size={14} />} onClick={() => st.toggleLock(ids)} disabled={!nodes.length}>
            Lock / unlock
          </Button>
          <Button size="sm" variant="ghost" icon={<Trash size={14} />} className="hover:!text-danger" onClick={() => st.deleteSelection()}>
            Delete
          </Button>
        </div>
      </Section>
    </div>
  );
}
