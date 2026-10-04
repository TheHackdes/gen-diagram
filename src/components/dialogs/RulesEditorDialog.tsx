import { ArrowDown, ArrowUp, Plus, Trash } from 'lucide-react';
import { useEffect } from 'react';
import { RULE_PRESETS } from '../../features/firewall/rules';
import { useDiagram } from '../../store/diagramStore';
import { useUi } from '../../store/uiStore';
import type { InfraNode } from '../../types';
import { AddressField } from '../properties/rules/AddressField';
import { ActionToggle, PortsField } from '../properties/rules/RuleControls';
import { useRules } from '../properties/rules/useRules';
import { Button } from '../ui/Button';
import { cn } from '../ui/cn';
import { Dialog } from '../ui/Dialog';
import { Input, Select } from '../ui/Field';

function RulesTable({ node }: { node: InfraNode }) {
  const { rules, add, change, move, remove } = useRules(node);
  // Put the caret in the source of a newly added rule (inserted before a final deny-all).
  const focusRule = (id: string) => setTimeout(() => document.getElementById(`t-${id}-src`)?.focus(), 40);
  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[860px] border-collapse text-[12px]">
          <thead>
            <tr className="bg-surface-2 text-left text-[11.5px] font-medium text-muted">
              <th className="w-8 px-2 py-2">#</th>
              <th className="w-8 px-1 py-2" aria-label="Enabled" />
              <th className="w-[120px] px-2 py-2">Action</th>
              <th className="w-[124px] px-2 py-2">Direction</th>
              <th className="px-2 py-2">Source</th>
              <th className="px-2 py-2">Destination</th>
              <th className="w-[108px] px-2 py-2">Protocol</th>
              <th className="w-[110px] px-2 py-2">Ports</th>
              <th className="px-2 py-2">Comment</th>
              <th className="w-[72px] px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rules.map((r, i) => (
              <tr key={r.id} className={cn('border-t border-line align-middle', !r.enabled && 'opacity-55')}>
                <td className="px-2 py-1.5 text-subtle">{i + 1}</td>
                <td className="px-1 py-1.5">
                  <input type="checkbox" aria-label={`Rule ${i + 1} enabled`} checked={r.enabled} onChange={(e) => change(r.id, { enabled: e.target.checked })} className="accent-[var(--primary)]" />
                </td>
                <td className="px-2 py-1.5">
                  <ActionToggle size="sm" value={r.action} onChange={(action) => change(r.id, { action })} />
                </td>
                <td className="px-2 py-1.5">
                  <Select aria-label="Direction" value={r.direction} onChange={(e) => change(r.id, { direction: e.target.value as typeof r.direction })} className="h-7 w-full pr-6 pl-2 text-[12px]">
                    <option value="in">Inbound</option>
                    <option value="out">Outbound</option>
                    <option value="forward">Forward</option>
                  </Select>
                </td>
                <td className="px-2 py-1.5">
                  <div>
                    <AddressField compact id={`t-${r.id}-src`} label="Source" value={r.source} node={node} onChange={(source) => change(r.id, { source })} />
                  </div>
                </td>
                <td className="px-2 py-1.5">
                  <AddressField compact id={`t-${r.id}-dst`} label="Destination" value={r.destination} node={node} onChange={(destination) => change(r.id, { destination })} />
                </td>
                <td className="px-2 py-1.5">
                  <Select aria-label="Protocol" value={r.protocol} onChange={(e) => change(r.id, { protocol: e.target.value as typeof r.protocol })} className="h-7 w-full pr-6 pl-2 text-[12px]">
                    {['tcp', 'udp', 'tcp/udp', 'icmp', 'any'].map((p) => (
                      <option key={p} value={p}>
                        {p === 'any' ? 'Any' : p.toUpperCase()}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="px-2 py-1.5">
                  <PortsField compact id={`t-${r.id}-ports`} rule={r} onChange={(ports) => change(r.id, { ports })} />
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    aria-label="Comment"
                    value={r.comment ?? ''}
                    placeholder="—"
                    onChange={(e) => change(r.id, { comment: e.target.value })}
                    onKeyDown={(e) => {
                      // Enter on the last row adds the next rule.
                      if (e.key === 'Enter' && i === rules.length - 1) {
                        focusRule(add({ protocol: r.protocol, direction: r.direction }).id);
                      }
                    }}
                    className="h-7 px-2 text-[12px]"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center justify-end gap-0.5">
                    <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(r.id, -1)} className="rounded p-1 text-subtle hover:text-fg disabled:opacity-25">
                      <ArrowUp size={13} />
                    </button>
                    <button type="button" aria-label="Move down" disabled={i === rules.length - 1} onClick={() => move(r.id, 1)} className="rounded p-1 text-subtle hover:text-fg disabled:opacity-25">
                      <ArrowDown size={13} />
                    </button>
                    <button type="button" aria-label="Delete rule" onClick={() => remove(r.id)} className="rounded p-1 text-subtle hover:text-danger">
                      <Trash size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rules.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-[12.5px] text-muted">
                  No rule yet. Add one below — rules are evaluated from top to bottom, the first match wins.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => focusRule(add().id)}>
          Add rule
        </Button>
        {RULE_PRESETS.map((p) => (
          <button key={p.label} type="button" onClick={() => add(p.rule)} className="h-8 rounded-lg border border-line px-2.5 text-[12px] text-muted hover:border-primary hover:text-primary">
            {p.label}
          </button>
        ))}
        <span className="ml-auto text-[11.5px] text-subtle">Enter in the last comment adds a rule</span>
      </div>
    </div>
  );
}

/** Wide spreadsheet-like editor for the rules of one device. */
export function RulesEditorDialog() {
  const nodeId = useUi((s) => s.rulesFor);
  const node = useDiagram((s) => (nodeId ? s.nodes.find((n) => n.id === nodeId) : undefined));
  const close = () => useUi.getState().openRules(null);
  // The device was deleted: forget it so that an undo does not reopen the editor.
  useEffect(() => {
    if (nodeId && !node) useUi.getState().openRules(null);
  }, [nodeId, node]);
  return (
    <Dialog
      open={!!node}
      onClose={close}
      title={node ? `Firewall rules — ${node.data.name}` : ''}
      description="Changes apply immediately and can be undone."
      size="full"
      footer={<Button onClick={close}>Done</Button>}
    >
      {node && <RulesTable node={node} />}
    </Dialog>
  );
}
