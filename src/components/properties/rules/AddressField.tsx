import { AlertTriangle, Layers, Link2, Server, X } from 'lucide-react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isReference, nodeRef, referenceFor, resolveAddress, vlanRef } from '../../../features/firewall/addresses';
import { addressProblem } from '../../../features/firewall/rules';
import { addressEntries, allIps } from '../../../features/nodes/ips';
import { useDiagram } from '../../../store/diagramStore';
import type { InfraNode } from '../../../types';
import { cn } from '../../ui/cn';
import { Input } from '../../ui/Field';

interface Suggestion {
  value: string;
  label: string;
  detail: string;
  kind: 'any' | 'vlan' | 'node' | 'literal';
}

/**
 * Addresses offered as sources / destinations. VLANs and devices are offered
 * as references, which follow renumbering; this device's own addresses also
 * as literals.
 */
export function useAddressSuggestions(node: InfraNode): Suggestion[] {
  const vlans = useDiagram((s) => s.vlans);
  const nodes = useDiagram((s) => s.nodes);
  return useMemo(() => {
    const own = addressEntries(node.data.props).filter((e) => e.address);
    const devices: Suggestion[] = [];
    for (const n of nodes) {
      if (n.id === node.id) continue;
      const ips = allIps(n.data.props).map((e) => e.address).filter(Boolean);
      if (ips.length) devices.push({ value: nodeRef(n), label: n.data.name, detail: ips.join(', '), kind: 'node' });
    }
    return [
      { value: 'any', label: 'Any address', detail: '', kind: 'any' },
      ...(own.length ? [{ value: nodeRef(node), label: 'This device', detail: own.map((e) => e.address).join(', '), kind: 'node' as const }] : []),
      ...(own.length > 1 ? own.map((e) => ({ value: e.address, label: `This device${e.label ? ` · ${e.label}` : ''}`, detail: e.address, kind: 'literal' as const })) : []),
      ...vlans.filter((v) => v.subnet).map((v) => ({ value: vlanRef(v), label: `VLAN ${v.id} · ${v.name}`, detail: v.subnet!, kind: 'vlan' as const })),
      ...devices.sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [vlans, nodes, node]);
}

/** Resolve rule addresses (references → names) in the properties panel and dialogs. */
export function useAddressResolver() {
  const vlans = useDiagram((s) => s.vlans);
  const nodes = useDiagram((s) => s.nodes);
  return useMemo(() => (value: string) => resolveAddress(value, nodes, vlans), [nodes, vlans]);
}

const KIND_ICON = { vlan: Layers, node: Server } as const;

/** A reference shown as a removable chip: name and what it currently covers. */
function ReferenceChip({ value, compact, onClear }: { value: string; compact: boolean; onClear: () => void }) {
  const resolve = useAddressResolver();
  const r = resolve(value);
  const missing = r.kind === 'missing';
  const KindIcon = missing ? AlertTriangle : KIND_ICON[r.kind as 'vlan' | 'node'];
  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-1.5 rounded-lg border px-2',
        compact ? 'h-7 text-[11.5px]' : 'h-8 text-[12.5px]',
        missing ? 'border-danger/60 bg-danger/5 text-danger' : 'border-primary/40 bg-primary/5 text-fg',
      )}
      title={missing ? 'This object was deleted — pick another source or destination' : `Linked to ${r.label}${r.detail ? ` (${r.detail})` : ''}: follows its changes`}
    >
      {KindIcon && <KindIcon size={12} className={cn('shrink-0', missing ? 'text-danger' : 'text-primary')} />}
      <span className="min-w-0 truncate font-medium">{r.label}</span>
      {r.detail && <span className="min-w-0 truncate font-mono text-[10.5px] text-muted">{r.detail}</span>}
      <button type="button" aria-label="Unlink and edit" title="Replace" onClick={onClear} className="ml-auto shrink-0 rounded p-0.5 text-subtle hover:text-fg">
        <X size={12} />
      </button>
    </div>
  );
}

/** Address input: references to VLANs / devices, "any", or a literal IP / CIDR / alias. */
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
  const suggestions = useAddressSuggestions(node);
  const vlans = useDiagram((s) => s.vlans);
  const nodes = useDiagram((s) => s.nodes);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const reference = isReference(value);
  const problem = reference ? null : addressProblem(value);
  // A literal that matches a VLAN subnet or a device address can become a link.
  const linkable = reference ? null : referenceFor(value, nodes, vlans);

  const query = value.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!query || query === 'any') return suggestions;
    return suggestions.filter((s) => s.label.toLowerCase().includes(query) || s.detail.toLowerCase().includes(query));
  }, [suggestions, query]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };
  const clear = () => {
    // Unlinking keeps what the reference stood for, ready to edit.
    const r = resolveAddress(value, nodes, vlans);
    onChange(r.kind === 'vlan' || r.kind === 'node' ? r.detail.split(',')[0].trim() : '');
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <div className="min-w-0">
      {!compact && (
        <div className="mb-1 flex items-start justify-between gap-2 text-xs font-medium text-muted">
          <label htmlFor={id}>{label}</label>
          <span className="flex min-w-0 flex-wrap justify-end gap-x-1 font-normal">
            <button type="button" onClick={() => pick('any')} className={cn('rounded px-1 text-[11px] hover:text-primary', value === 'any' ? 'text-primary' : 'text-subtle')}>
              any
            </button>
            {suggestions.some((s) => s.value === nodeRef(node)) && (
              <button
                type="button"
                onClick={() => pick(nodeRef(node))}
                className={cn('rounded px-1 text-[11px] hover:text-primary', value === nodeRef(node) ? 'text-primary' : 'text-subtle')}
              >
                this device
              </button>
            )}
          </span>
        </div>
      )}
      {reference ? (
        <ReferenceChip value={value} compact={compact} onClear={clear} />
      ) : (
        <Input
          ref={inputRef}
          id={id}
          mono
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          autoComplete="off"
          invalid={!!problem}
          title={problem ?? undefined}
          value={value}
          placeholder="any, VLAN, device, 10.0.0.0/24…"
          onFocus={(e) => {
            setOpen(true);
            setActive(0);
            // "any" is a default: typing replaces it.
            if (value === 'any') e.target.select();
          }}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (!open || !filtered.length) return;
            if (e.key === 'ArrowDown') (e.preventDefault(), setActive((a) => (a + 1) % filtered.length));
            else if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a) => (a - 1 + filtered.length) % filtered.length));
            else if (e.key === 'Enter') (e.preventDefault(), pick(filtered[Math.min(active, filtered.length - 1)].value));
            else if (e.key === 'Escape') (e.stopPropagation(), setOpen(false));
          }}
          className={compact ? 'h-7 px-2 text-[11.5px]' : undefined}
        />
      )}
      {open && !reference && filtered.length > 0 && (
        <SuggestionList id={`${id}-list`} anchor={inputRef} items={filtered} active={active} onPick={pick} onHover={setActive} />
      )}
      {linkable && (
        <button
          type="button"
          onClick={() => onChange(linkable.ref)}
          title="Link the rule to this object: it follows renumbering"
          className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-[11px] font-medium text-primary hover:underline"
        >
          <Link2 size={11} className="shrink-0" /> {compact ? linkable.label : `Link to ${linkable.label}`}
        </button>
      )}
      {!compact && problem && <p className="mt-1 text-[11px] text-danger">{problem}</p>}
    </div>
  );
}

/** Dropdown under the input, rendered in the body so tables and dialogs do not clip it. */
function SuggestionList({
  id,
  anchor,
  items,
  active,
  onPick,
  onHover,
}: {
  id: string;
  anchor: React.RefObject<HTMLInputElement | null>;
  items: Suggestion[];
  active: number;
  onPick: (v: string) => void;
  onHover: (i: number) => void;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    const update = () => anchor.current && setRect(anchor.current.getBoundingClientRect());
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [anchor]);
  if (!rect) return null;
  const below = window.innerHeight - rect.bottom > 220;
  return createPortal(
    <ul
      id={id}
      role="listbox"
      className="fixed z-[100] max-h-56 overflow-auto rounded-lg border border-line bg-surface p-1 shadow-lg"
      style={{ left: rect.left, width: Math.max(rect.width, 260), ...(below ? { top: rect.bottom + 4 } : { bottom: window.innerHeight - rect.top + 4 }) }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {items.map((s, i) => {
        const KindIcon = s.kind === 'vlan' ? Layers : s.kind === 'node' ? Server : null;
        return (
          <li
            key={s.value + s.label}
            role="option"
            aria-selected={i === active}
            onMouseEnter={() => onHover(i)}
            onClick={() => onPick(s.value)}
            className={cn('flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-[12px]', i === active && 'bg-surface-2')}
          >
            <span className="w-3 shrink-0 text-primary">{KindIcon && <KindIcon size={12} />}</span>
            <span className="min-w-0 truncate text-fg">{s.label}</span>
            <span className="ml-auto min-w-0 truncate pl-2 font-mono text-[10.5px] text-subtle">{s.detail}</span>
          </li>
        );
      })}
    </ul>,
    document.body,
  );
}
