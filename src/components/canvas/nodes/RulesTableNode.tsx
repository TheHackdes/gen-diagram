import type { NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { colorOf, getDefinition } from '../../../data/catalog';
import { formatPorts, hasRules, rulesOf } from '../../../features/firewall/rules';
import { useDiagram } from '../../../store/diagramStore';
import type { InfraNode } from '../../../types';
import { str } from '../../../utils/misc';
import { Icon } from '../../icons/Icon';
import { cn } from '../../ui/cn';
import { NodeHandles, Resizer } from './shared';

const DIR: Record<string, string> = { in: 'In', out: 'Out', forward: 'Fwd' };

/** Firewall rules of one device (or all devices) rendered as a table on the canvas. */
function RulesTableNodeImpl({ id, data, selected }: NodeProps<InfraNode>) {
  const scope = str(data.props.scope) || 'all';
  const showDisabled = data.props.showDisabled === true;
  const devices = useDiagram(
    useShallow((s) => s.nodes.filter((n) => hasRules(n) && (scope === 'all' || n.id === scope) && rulesOf(n.data.props).length > 0)),
  );
  const missing = useDiagram((s) => scope !== 'all' && !s.nodes.some((n) => n.id === scope));
  const groups = devices.map((n) => ({ node: n, rules: rulesOf(n.data.props).filter((r) => showDisabled || r.enabled) })).filter((g) => g.rules.length);

  return (
    <div
      className={cn('selection-ring relative min-w-[420px] overflow-hidden rounded-xl border border-node-line bg-node', selected && 'ring-2 ring-primary/30')}
      style={{ boxShadow: 'var(--node-shadow)' }}
    >
      <Resizer id={id} selected={selected} minWidth={420} minHeight={60} locked={data.locked} />
      <NodeHandles nodeId={id} />
      <div className="border-b border-node-line px-3 py-2 text-[13px] font-semibold text-fg">{str(data.props.text) || 'Firewall rules'}</div>
      {missing ? (
        <p className="px-3 py-3 text-[11.5px] text-danger">The equipment of this table was deleted. Pick another one in the properties panel.</p>
      ) : groups.length === 0 ? (
        <p className="px-3 py-3 text-[11.5px] text-subtle">No firewall rule {scope === 'all' ? 'in this diagram' : 'on this equipment'} yet.</p>
      ) : (
        <table className="w-full border-collapse text-[11px] whitespace-nowrap">
          <thead>
            <tr className="bg-surface-2 text-left text-[10.5px] font-semibold text-muted">
              <th className="px-2 py-1.5 font-semibold">#</th>
              <th className="px-2 py-1.5 font-semibold">Action</th>
              <th className="px-2 py-1.5 font-semibold">Dir</th>
              <th className="px-2 py-1.5 font-semibold">Source</th>
              <th className="px-2 py-1.5 font-semibold">Destination</th>
              <th className="px-2 py-1.5 font-semibold">Proto</th>
              <th className="px-2 py-1.5 font-semibold">Ports</th>
              <th className="px-2 py-1.5 font-semibold">Comment</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(({ node, rules }) => {
              const def = getDefinition(node.data.type);
              const product = str(node.data.props.fwProduct) || str(node.data.props.product);
              return [
                <tr key={node.id} className="border-t border-node-line">
                  <td colSpan={8} className="px-2 pt-2 pb-1">
                    <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-fg">
                      <span style={{ color: colorOf(def) }}>
                        <Icon name={def.icon} size={12} brandColor={def.icon.startsWith('brand:')} />
                      </span>
                      {node.data.name}
                      <span className="font-normal text-subtle">
                        {[product, str(node.data.props.fwPolicy)].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </td>
                </tr>,
                ...rules.map((r, i) => (
                  <tr key={`${node.id}-${r.id}`} className={cn('border-t border-node-line/60', !r.enabled && 'opacity-50 line-through')}>
                    <td className="px-2 py-1 font-mono text-subtle">{i + 1}</td>
                    <td className="px-2 py-1">
                      <span className={cn('rounded px-1.5 py-px text-[10px] font-semibold capitalize', r.action === 'allow' ? 'bg-emerald-500/15 text-emerald-600' : 'bg-red-500/15 text-red-600')}>
                        {r.action}
                      </span>
                    </td>
                    <td className="px-2 py-1 text-muted">{DIR[r.direction]}</td>
                    <td className="px-2 py-1 font-mono text-fg">{r.source}</td>
                    <td className="px-2 py-1 font-mono text-fg">{r.destination}</td>
                    <td className="px-2 py-1 text-muted uppercase">{r.protocol}</td>
                    <td className="px-2 py-1 font-mono text-fg">{formatPorts(r)}</td>
                    <td className="px-2 py-1 text-muted">{r.comment}</td>
                  </tr>
                )),
              ];
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export const RulesTableNode = memo(RulesTableNodeImpl);
