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
  Lock,
  Trash,
} from 'lucide-react';
import { useDiagram } from '../../store/diagramStore';
import type { InfraNode } from '../../types';
import { modKey } from '../../utils/misc';
import { Button, IconButton } from '../ui/Button';
import { Section } from './NodeProperties';

export function MultiProperties({ nodes, edgeCount }: { nodes: InfraNode[]; edgeCount: number }) {
  const st = useDiagram.getState();
  const ids = nodes.map((n) => n.id);
  return (
    <div>
      <div className="border-b border-line px-4 py-4">
        <div className="text-[11px] font-semibold tracking-wider text-primary uppercase">Selection</div>
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
