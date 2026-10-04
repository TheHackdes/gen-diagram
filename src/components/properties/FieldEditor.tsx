import { ArrowRight, Plus, Sparkles, X } from 'lucide-react';
import { definitionHasField, getDefinition } from '../../data/catalog';
import { useDiagram } from '../../store/diagramStore';
import type { FieldDef, InfraNode } from '../../types';
import { isValidCidr, isValidIPv4, isValidMac } from '../../utils/ip';
import { str } from '../../utils/misc';
import { cn } from '../ui/cn';
import { FieldRow, Input, Select, Switch, Textarea } from '../ui/Field';
import { hasRules } from '../../features/firewall/rules';
import { IpListEditor } from './IpListEditor';
import { OsPicker } from './OsPicker';
import { suggestionFor } from './suggestions';

function validate(field: FieldDef, value: string): string | null {
  if (!value) return null;
  if (field.type === 'ip' && !isValidIPv4(value)) return 'Invalid IPv4 address';
  if (field.type === 'cidr' && !isValidCidr(value)) return 'Use CIDR notation, e.g. 10.0.0.0/24';
  if (field.type === 'mac' && !isValidMac(value)) return 'Format AA:BB:CC:DD:EE:FF';
  if (field.type === 'number' && Number.isNaN(Number(value))) return 'Must be a number';
  return null;
}

export function VlanSelect({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const vlans = useDiagram((s) => s.vlans);
  const addVlan = useDiagram((s) => s.addVlan);
  const known = vlans.some((v) => String(v.id) === value);
  return (
    <Select
      id={id}
      value={value}
      onChange={(e) => {
        if (e.target.value === '__new') onChange(String(addVlan().id));
        else onChange(e.target.value);
      }}
    >
      <option value="">None</option>
      {vlans.map((v) => (
        <option key={v.uid} value={String(v.id)}>
          VLAN {v.id} — {v.name}
          {v.subnet ? `  (${v.subnet})` : ''}
        </option>
      ))}
      {value && !known && <option value={value}>VLAN {value} (undefined)</option>}
      <option value="__new">+ New VLAN…</option>
    </Select>
  );
}

export function VlanMultiSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const vlans = useDiagram((s) => s.vlans);
  const selected = new Set(value.split(/[\s,]+/).filter(Boolean));
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next].sort((a, b) => Number(a) - Number(b)).join(','));
  };
  if (!vlans.length) return <p className="text-[11.5px] text-subtle">Define VLANs in the VLANs tab first.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {vlans.map((v) => {
        const on = selected.has(String(v.id));
        return (
          <button
            key={v.uid}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(String(v.id))}
            className={cn('flex h-6 items-center gap-1 rounded-md border px-1.5 text-[11px] font-semibold transition-colors', on ? 'text-white' : 'border-line text-muted hover:text-fg')}
            style={on ? { background: v.color, borderColor: v.color } : undefined}
            title={v.name}
          >
            {!on && <span className="h-1.5 w-1.5 rounded-full" style={{ background: v.color }} />}
            {v.id}
          </button>
        );
      })}
    </div>
  );
}

function PortsEditor({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const rows = value
    ? value.split(',').map((p) => {
        const [host = '', container = ''] = p.trim().split(':');
        return { host, container };
      })
    : [];
  const write = (next: { host: string; container: string }[]) =>
    onChange(next.map((r) => `${r.host}:${r.container}`).join(', '));
  return (
    <div className="space-y-1.5" id={id}>
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input mono aria-label="Host port" placeholder="host" value={r.host} onChange={(e) => write(rows.map((x, j) => (j === i ? { ...x, host: e.target.value } : x)))} />
          <ArrowRight size={14} className="shrink-0 text-subtle" />
          <Input mono aria-label="Container port" placeholder="container" value={r.container} onChange={(e) => write(rows.map((x, j) => (j === i ? { ...x, container: e.target.value } : x)))} />
          <button type="button" aria-label="Remove port" onClick={() => write(rows.filter((_, j) => j !== i))} className="rounded p-1 text-subtle hover:text-danger">
            <X size={13} />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => write([...rows, { host: '', container: '' }])} className="flex items-center gap-1 text-[12px] font-medium text-primary hover:underline">
        <Plus size={12} /> Add port mapping
      </button>
    </div>
  );
}

export function FieldEditor({ node, field }: { node: InfraNode; field: FieldDef }) {
  const update = useDiagram((s) => s.updateNodeProps);
  const vlans = useDiagram((s) => s.vlans);
  const nodes = useDiagram((s) => s.nodes);
  const value = str(node.data.props[field.key]);
  const set = (v: unknown) => update(node.id, { [field.key]: v });
  const id = `f-${node.id}-${field.key}`;

  if (field.type === 'os') return <OsPicker nodeId={node.id} osId={node.data.props.os} version={node.data.props.osVersion} />;

  // Main address and additional ones are edited together in one list.
  if (field.key === 'ip' && field.type === 'ip') return <IpListEditor node={node} field={field} />;
  // Each address carries its VLAN: the separate VLAN field would duplicate the first one.
  if (field.key === 'vlan' && definitionHasField(getDefinition(node.data.type), 'ip')) return null;

  if (field.type === 'nodeRef')
    return (
      <FieldRow label={field.label} htmlFor={id}>
        <Select id={id} value={value || 'all'} onChange={(e) => set(e.target.value)}>
          <option value="all">All equipment</option>
          {nodes.filter(hasRules).map((n) => (
            <option key={n.id} value={n.id}>
              {n.data.name}
            </option>
          ))}
        </Select>
      </FieldRow>
    );

  if (field.type === 'boolean')
    return <Switch id={id} label={field.label} checked={node.data.props[field.key] === true} onChange={(v) => set(v)} />;

  const error = validate(field, value);
  const suggestion = !value ? suggestionFor(field, node, vlans, nodes) : undefined;

  let control;
  switch (field.type) {
    case 'textarea':
      control = <Textarea id={id} rows={3} value={value} placeholder={field.placeholder} onChange={(e) => set(e.target.value)} />;
      break;
    case 'select':
      control = (
        <Select id={id} value={value} onChange={(e) => set(e.target.value)}>
          <option value="">—</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      );
      break;
    case 'vlan':
      control = <VlanSelect id={id} value={value} onChange={set} />;
      break;
    case 'vlanList':
      control = <VlanMultiSelect value={value} onChange={set} />;
      break;
    case 'ports':
      control = <PortsEditor id={id} value={value} onChange={set} />;
      break;
    default:
      control = (
        <Input
          id={id}
          value={value}
          invalid={!!error}
          mono={field.mono || field.type === 'ip' || field.type === 'cidr' || field.type === 'mac'}
          inputMode={field.type === 'number' ? 'numeric' : undefined}
          placeholder={suggestion ?? field.placeholder}
          onChange={(e) => set(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Tab' && !value && suggestion && !e.shiftKey) {
              set(suggestion);
            }
          }}
        />
      );
  }

  return (
    <FieldRow
      label={field.label}
      htmlFor={id}
      error={error}
      help={field.help}
      hint={
        suggestion ? (
          <button type="button" onClick={() => set(suggestion)} className="inline-flex items-center gap-1 font-medium text-primary hover:underline" title="Apply suggestion (Tab)">
            <Sparkles size={11} />
            {suggestion}
          </button>
        ) : undefined
      }
    >
      {control}
    </FieldRow>
  );
}
