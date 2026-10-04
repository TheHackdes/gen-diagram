import { ArrowDown, ArrowRight, ArrowUp, Plus, Table, Trash } from 'lucide-react';
import { addressProblem, isValidPorts, newRule, PROTOCOLS, RULE_PRESETS, rulesOf } from '../../features/firewall/rules';
import { allIps } from '../../features/nodes/ips';
import { absolutePosition, indexById, nodeSize } from '../../features/nodes/hierarchy';
import { useDiagram } from '../../store/diagramStore';
import type { FirewallRule, InfraNode } from '../../types';
import { cn } from '../ui/cn';
import { Input, Select } from '../ui/Field';

function AddressSuggestions({ id, node }: { id: string; node: InfraNode }) {
  const vlans = useDiagram((s) => s.vlans);
  const nodes = useDiagram((s) => s.nodes);
  const values = new Set<string>(['any']);
  for (const e of allIps(node.data.props)) if (e.address) values.add(e.address);
  for (const v of vlans) if (v.subnet) values.add(v.subnet);
  for (const n of nodes) for (const e of allIps(n.data.props)) if (e.address) values.add(e.address);
  return (
    <datalist id={id}>
      {[...values].map((v) => {
        const vlan = vlans.find((x) => x.subnet === v);
        const owner = nodes.find((n) => allIps(n.data.props).some((e) => e.address === v));
        return <option key={v} value={v} label={vlan ? `VLAN ${vlan.id} · ${vlan.name}` : owner?.data.name} />;
      })}
    </datalist>
  );
}

function RuleCard({ rule, index, count, node, onChange, onMove, onDelete }: {
  rule: FirewallRule;
  index: number;
  count: number;
  node: InfraNode;
  onChange: (patch: Partial<FirewallRule>) => void;
  onMove: (delta: number) => void;
  onDelete: () => void;
}) {
  const listId = `fw-addr-${node.id}`;
  const noPorts = rule.protocol === 'icmp' || rule.protocol === 'any';
  const srcErr = addressProblem(rule.source);
  const dstErr = addressProblem(rule.destination);
  const portErr = !noPorts && !isValidPorts(rule.ports);
  return (
    <div className={cn('rounded-lg border p-2', rule.enabled ? 'border-line' : 'border-dashed border-line opacity-60')}>
      <div className="flex items-center gap-1.5">
        <span className="w-5 text-center font-mono text-[11px] text-subtle">{index + 1}</span>
        <div className="flex rounded-md bg-surface-2 p-0.5" role="radiogroup" aria-label="Action">
          {(['allow', 'deny'] as const).map((a) => (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={rule.action === a}
              onClick={() => onChange({ action: a })}
              className={cn(
                'h-6 rounded px-2 text-[11px] font-semibold capitalize',
                rule.action === a ? (a === 'allow' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white') : 'text-muted hover:text-fg',
              )}
            >
              {a}
            </button>
          ))}
        </div>
        <Select aria-label="Direction" value={rule.direction} onChange={(e) => onChange({ direction: e.target.value as FirewallRule['direction'] })} className="h-7 w-auto px-1.5 text-[11.5px]">
          <option value="in">In</option>
          <option value="out">Out</option>
          <option value="forward">Fwd</option>
        </Select>
        <Select aria-label="Protocol" value={rule.protocol} onChange={(e) => onChange({ protocol: e.target.value as FirewallRule['protocol'] })} className="h-7 w-auto px-1.5 text-[11.5px] uppercase">
          {PROTOCOLS.map((p) => (
            <option key={p} value={p}>
              {p.toUpperCase()}
            </option>
          ))}
        </Select>
        <span className="flex-1" />
        <input type="checkbox" aria-label="Enabled" title="Enabled" checked={rule.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} className="accent-[var(--primary)]" />
        <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => onMove(-1)} className="rounded p-0.5 text-subtle hover:text-fg disabled:opacity-30">
          <ArrowUp size={12} />
        </button>
        <button type="button" aria-label="Move down" disabled={index === count - 1} onClick={() => onMove(1)} className="rounded p-0.5 text-subtle hover:text-fg disabled:opacity-30">
          <ArrowDown size={12} />
        </button>
        <button type="button" aria-label="Delete rule" onClick={onDelete} className="rounded p-0.5 text-subtle hover:text-danger">
          <Trash size={12} />
        </button>
      </div>
      <div className="mt-1.5 grid grid-cols-[1fr_auto_1fr] items-center gap-1">
        <Input aria-label="Source" title={srcErr ?? 'Source'} list={listId} mono invalid={!!srcErr} value={rule.source} placeholder="Source" onChange={(e) => onChange({ source: e.target.value })} className="h-7 text-[11.5px]" />
        <ArrowRight size={12} className="text-subtle" />
        <Input aria-label="Destination" title={dstErr ?? 'Destination'} list={listId} mono invalid={!!dstErr} value={rule.destination} placeholder="Destination" onChange={(e) => onChange({ destination: e.target.value })} className="h-7 text-[11.5px]" />
      </div>
      <div className="mt-1 grid grid-cols-[88px_1fr] gap-1">
        <Input
          aria-label="Ports"
          mono
          disabled={noPorts}
          invalid={portErr}
          title={portErr ? 'Ports: 22 · 80,443 · 8000-8100' : 'Ports'}
          value={noPorts ? '' : rule.ports}
          placeholder={noPorts ? '—' : 'all ports'}
          onChange={(e) => onChange({ ports: e.target.value })}
          className="h-7 text-[11.5px]"
        />
        <Input aria-label="Comment" value={rule.comment ?? ''} placeholder="Comment" onChange={(e) => onChange({ comment: e.target.value })} className="h-7 text-[11.5px]" />
      </div>
    </div>
  );
}

/** Structured firewall rules: action, direction, source → destination, protocol, ports. */
export function FirewallRulesSection({ node }: { node: InfraNode }) {
  const update = useDiagram((s) => s.updateNodeProps);
  const rules = rulesOf(node.data.props);
  const write = (next: FirewallRule[]) => update(node.id, { fwRules: next });
  const mainIp = allIps(node.data.props)[0]?.address;

  const add = (partial: Partial<FirewallRule> = {}) =>
    write([...rules, newRule({ destination: mainIp && node.data.props.fw === true ? mainIp : 'any', ...partial })]);

  const showTable = () => {
    const st = useDiagram.getState();
    const byId = indexById(st.nodes);
    const abs = absolutePosition(node, byId);
    const size = nodeSize(node);
    const id = st.addNode('fw-table', { x: abs.x + size.width + 400, y: abs.y + 60 }, { scope: node.id, text: `Firewall rules — ${node.data.name}` });
    st.select([id]);
  };

  return (
    <section className="border-b border-line px-4 py-3.5">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-[12.5px] font-semibold text-fg">Firewall rules ({rules.length})</h4>
        <button type="button" onClick={showTable} className="flex items-center gap-1 text-[11.5px] font-medium text-primary hover:underline" title="Add a rules table to the diagram">
          <Table size={12} /> Show on diagram
        </button>
      </div>
      <AddressSuggestions id={`fw-addr-${node.id}`} node={node} />
      <div className="space-y-1.5">
        {rules.map((r, i) => (
          <RuleCard
            key={r.id}
            rule={r}
            index={i}
            count={rules.length}
            node={node}
            onChange={(patch) => write(rules.map((x) => (x.id === r.id ? { ...x, ...patch } : x)))}
            onMove={(d) => {
              const next = rules.slice();
              const [moved] = next.splice(i, 1);
              next.splice(i + d, 0, moved);
              write(next);
            }}
            onDelete={() => write(rules.filter((x) => x.id !== r.id))}
          />
        ))}
        {rules.length === 0 && <p className="text-[11.5px] text-subtle">No rule yet. Rules are evaluated top to bottom.</p>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <button type="button" onClick={() => add()} className="flex h-6 items-center gap-1 rounded-md bg-primary px-2 text-[11.5px] font-medium text-primary-fg hover:bg-primary-hover">
          <Plus size={12} /> Rule
        </button>
        {RULE_PRESETS.map((p) => (
          <button key={p.label} type="button" onClick={() => add(p.rule)} className="h-6 rounded-md border border-line px-1.5 text-[11px] text-muted hover:border-primary hover:text-primary">
            + {p.label}
          </button>
        ))}
      </div>
    </section>
  );
}
