import { useMemo } from 'react';
import { addressProblem } from '../../../features/firewall/rules';
import { addressEntries } from '../../../features/nodes/ips';
import { useDiagram } from '../../../store/diagramStore';
import type { InfraNode } from '../../../types';
import { cn } from '../../ui/cn';
import { Input } from '../../ui/Field';

interface Suggestion {
  value: string;
  label: string;
}

/** Addresses offered as sources / destinations: VLAN subnets, devices, this device. */
export function useAddressSuggestions(node: InfraNode): { own: Suggestion[]; items: Suggestion[] } {
  const vlans = useDiagram((s) => s.vlans);
  const nodes = useDiagram((s) => s.nodes);
  return useMemo(() => {
    const own = addressEntries(node.data.props)
      .filter((e) => e.address)
      .map((e) => ({ value: e.address, label: `This device${e.label ? ` · ${e.label}` : ''}` }));
    const devices: Suggestion[] = [];
    for (const n of nodes) {
      if (n.id === node.id) continue;
      for (const e of addressEntries(n.data.props)) if (e.address) devices.push({ value: e.address, label: e.label ? `${n.data.name} · ${e.label}` : n.data.name });
    }
    return {
      own,
      items: [
        ...vlans.filter((v) => v.subnet).map((v) => ({ value: v.subnet!, label: `VLAN ${v.id} · ${v.name}` })),
        ...devices.sort((a, b) => a.label.localeCompare(b.label)),
      ],
    };
  }, [vlans, nodes, node]);
}

/** Address input with suggestions and one-click "any" / "this device". */
export function AddressField({
  id,
  label,
  value,
  node,
  onChange,
  compact = false,
}: {
  id: string;
  label: string;
  value: string;
  node: InfraNode;
  onChange: (v: string) => void;
  /** Table cell: no label, no shortcuts. */
  compact?: boolean;
}) {
  const { own, items } = useAddressSuggestions(node);
  const problem = addressProblem(value);
  const listId = `${id}-list`;
  return (
    <div className="min-w-0">
      {!compact && (
        <div className="mb-1 flex items-start justify-between gap-2 text-xs font-medium text-muted">
          <label htmlFor={id}>{label}</label>
          <span className="flex min-w-0 flex-wrap justify-end gap-x-1 font-normal">
            <button type="button" onClick={() => onChange('any')} className={cn('rounded px-1 text-[11px] hover:text-primary', value === 'any' ? 'text-primary' : 'text-subtle')}>
              any
            </button>
            {/* One shortcut per address of this device (no "main" address). */}
            {own.map((o) => (
              <button
                key={o.value}
                type="button"
                title={o.label}
                onClick={() => onChange(o.value)}
                className={cn('rounded px-1 font-mono text-[10.5px] hover:text-primary', value === o.value ? 'text-primary' : 'text-subtle')}
              >
                {own.length > 1 ? o.value : 'this device'}
              </button>
            ))}
          </span>
        </div>
      )}
      <Input
        id={id}
        list={listId}
        mono
        aria-label={label}
        invalid={!!problem}
        title={problem ?? undefined}
        value={value}
        placeholder="any, 10.0.0.0/24…"
        onChange={(e) => onChange(e.target.value)}
        className={compact ? 'h-7 px-2 text-[11.5px]' : undefined}
      />
      <datalist id={listId}>
        <option value="any">Any address</option>
        {own.map((o) => (
          <option key={`own-${o.value}`} value={o.value}>
            {o.label}
          </option>
        ))}
        {items.map((s) => (
          <option key={s.value + s.label} value={s.value}>
            {s.label}
          </option>
        ))}
      </datalist>
      {!compact && problem && <p className="mt-1 text-[11px] text-danger">{problem}</p>}
    </div>
  );
}
