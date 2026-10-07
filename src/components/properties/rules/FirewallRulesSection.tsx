import { ArrowDown, ArrowUp, ChevronDown, Maximize2, Plus, Table, Trash } from 'lucide-react';
import { useState } from 'react';
import type { ResolvedAddress } from '../../../features/firewall/addresses';
import { addressProblem, describeRule, isValidPorts, RULE_PRESETS } from '../../../features/firewall/rules';
import { absolutePosition, indexById, nodeSize } from '../../../features/nodes/hierarchy';
import { useDiagram } from '../../../store/diagramStore';
import { useUi } from '../../../store/uiStore';
import type { FirewallRule, InfraNode } from '../../../types';
import { Button, IconButton } from '../../ui/Button';
import { cn } from '../../ui/cn';
import { FieldRow, Input } from '../../ui/Field';
import { AddressField, useAddressResolver } from './AddressField';
import { ActionToggle, DIRECTIONS, PortsField, PROTOCOL_OPTIONS, SegmentedSmall } from './RuleControls';
import { useRules } from './useRules';

const hasProblem = (r: FirewallRule, resolve: (v: string) => ResolvedAddress) =>
  !!addressProblem(r.source) ||
  !!addressProblem(r.destination) ||
  resolve(r.source).kind === 'missing' ||
  resolve(r.destination).kind === 'missing' ||
  (['tcp', 'udp', 'tcp/udp'].includes(r.protocol) && !isValidPorts(r.ports));

function RuleEditor({ node, rule, onChange }: { node: InfraNode; rule: FirewallRule; onChange: (p: Partial<FirewallRule>) => void }) {
  const id = (k: string) => `rule-${rule.id}-${k}`;
  return (
    <div className="space-y-2.5 border-t border-line px-2.5 pt-2.5 pb-3">
      <ActionToggle value={rule.action} onChange={(action) => onChange({ action })} />
      <SegmentedSmall label="Direction" value={rule.direction} options={DIRECTIONS} onChange={(direction) => onChange({ direction })} />
      <AddressField id={id('src')} label="Source" value={rule.source} node={node} onChange={(source) => onChange({ source })} />
      <AddressField id={id('dst')} label="Destination" value={rule.destination} node={node} onChange={(destination) => onChange({ destination })} />
      <div>
        <span className="mb-1 block text-xs font-medium text-muted">Protocol</span>
        <SegmentedSmall label="Protocol" value={rule.protocol} options={PROTOCOL_OPTIONS} onChange={(protocol) => onChange({ protocol })} />
      </div>
      <FieldRow label="Ports" htmlFor={id('ports')}>
        <PortsField id={id('ports')} rule={rule} onChange={(ports) => onChange({ ports })} />
      </FieldRow>
      <FieldRow label="Comment" htmlFor={id('comment')}>
        <Input id={id('comment')} value={rule.comment ?? ''} placeholder="Why this rule exists" onChange={(e) => onChange({ comment: e.target.value })} />
      </FieldRow>
    </div>
  );
}

/** Firewall rules in the properties panel: readable list, one rule edited at a time. */
export function FirewallRulesSection({ node }: { node: InfraNode }) {
  const { rules, add, change, move, remove } = useRules(node);
  const resolve = useAddressResolver();
  const [open, setOpen] = useState<string | null>(null);

  const addAndEdit = (partial: Partial<FirewallRule> = {}) => setOpen(add(partial).id);

  const showTable = () => {
    const st = useDiagram.getState();
    const byId = indexById(st.nodes);
    const abs = absolutePosition(node, byId);
    const id = st.addNode('fw-table', { x: abs.x + nodeSize(node).width + 400, y: abs.y + 60 }, { scope: node.id, text: `Firewall rules — ${node.data.name}` });
    st.select([id]);
  };

  return (
    <section className="border-b border-line px-4 py-3.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-[12.5px] font-semibold text-fg">Firewall rules ({rules.length})</h4>
        <div className="flex items-center gap-0.5">
          <IconButton size="sm" label="Show as a table on the diagram" onClick={showTable}>
            <Table size={14} />
          </IconButton>
          <IconButton size="sm" label="Open the rule editor" onClick={() => useUi.getState().openRules(node.id)}>
            <Maximize2 size={14} />
          </IconButton>
        </div>
      </div>
      {rules.length === 0 ? (
        <p className="mb-2 text-[11.5px] leading-snug text-subtle">No rule yet. Rules are evaluated from top to bottom; the first match wins.</p>
      ) : (
        <ol className="mb-2 space-y-1">
          {rules.map((r, i) => {
            const d = describeRule(r, (v) => resolve(v).label);
            const expanded = open === r.id;
            return (
              <li key={r.id} className={cn('overflow-hidden rounded-lg border', expanded ? 'border-line-strong shadow-sm' : 'border-line', !r.enabled && 'opacity-60')}>
                <div className="flex items-center gap-1.5 px-2 py-1.5">
                  <input
                    type="checkbox"
                    aria-label={`Rule ${i + 1} enabled`}
                    title="Enabled"
                    checked={r.enabled}
                    onChange={(e) => change(r.id, { enabled: e.target.checked })}
                    className="shrink-0 accent-[var(--primary)]"
                  />
                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? null : r.id)}
                    aria-expanded={expanded}
                    className="flex min-w-0 flex-1 items-start gap-2 text-left"
                  >
                    <span className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', r.action === 'allow' ? 'bg-emerald-500' : 'bg-red-500')} />
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className={cn('block truncate text-[12px] font-medium', hasProblem(r, resolve) ? 'text-danger' : 'text-fg')}>
                        {i + 1}. {d.head}
                      </span>
                      <span className="block truncate font-mono text-[10.5px] text-muted">{d.flow}</span>
                      {r.comment && <span className="block truncate text-[10.5px] text-subtle">{r.comment}</span>}
                    </span>
                    <ChevronDown size={13} className={cn('mt-0.5 shrink-0 text-subtle transition-transform', expanded && 'rotate-180')} />
                  </button>
                  <div className="flex shrink-0 flex-col">
                    <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(r.id, -1)} className="text-subtle hover:text-fg disabled:opacity-25">
                      <ArrowUp size={11} />
                    </button>
                    <button type="button" aria-label="Move down" disabled={i === rules.length - 1} onClick={() => move(r.id, 1)} className="text-subtle hover:text-fg disabled:opacity-25">
                      <ArrowDown size={11} />
                    </button>
                  </div>
                  <button type="button" aria-label="Delete rule" onClick={() => remove(r.id)} className="shrink-0 rounded p-0.5 text-subtle hover:text-danger">
                    <Trash size={12} />
                  </button>
                </div>
                {expanded && <RuleEditor node={node} rule={r} onChange={(p) => change(r.id, p)} />}
              </li>
            );
          })}
        </ol>
      )}
      <div className="flex flex-wrap items-center gap-1">
        <Button size="xs" variant="primary" icon={<Plus size={12} />} onClick={() => addAndEdit()}>
          Add rule
        </Button>
        {RULE_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => addAndEdit(p.rule)}
            className="h-7 rounded-md border border-line px-2 text-[11.5px] text-muted hover:border-primary hover:text-primary"
          >
            {p.label}
          </button>
        ))}
      </div>
    </section>
  );
}
