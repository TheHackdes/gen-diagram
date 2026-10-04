import { COMMON_PORTS, PROTOCOLS, isValidPorts } from '../../../features/firewall/rules';
import type { FirewallRule } from '../../../types';
import { cn } from '../../ui/cn';
import { Input } from '../../ui/Field';

export function ActionToggle({ value, onChange, size = 'md' }: { value: FirewallRule['action']; onChange: (v: FirewallRule['action']) => void; size?: 'sm' | 'md' }) {
  return (
    <div className="flex rounded-md bg-surface-2 p-0.5" role="radiogroup" aria-label="Action">
      {(['allow', 'deny'] as const).map((a) => (
        <button
          key={a}
          type="button"
          role="radio"
          aria-checked={value === a}
          onClick={() => onChange(a)}
          className={cn(
            'rounded font-semibold capitalize transition-colors',
            size === 'sm' ? 'h-6 px-2 text-[11px]' : 'h-7 flex-1 px-3 text-[12px]',
            value === a ? (a === 'allow' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white') : 'text-muted hover:text-fg',
          )}
        >
          {a}
        </button>
      ))}
    </div>
  );
}

export function SegmentedSmall<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="flex rounded-md bg-surface-2 p-0.5" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn('h-7 flex-1 rounded px-2 text-[12px] font-medium transition-colors', value === o.value ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const DIRECTIONS: { value: FirewallRule['direction']; label: string }[] = [
  { value: 'in', label: 'Inbound' },
  { value: 'out', label: 'Outbound' },
  { value: 'forward', label: 'Forward' },
];

export const PROTOCOL_OPTIONS = PROTOCOLS.map((p) => ({ value: p, label: p === 'any' ? 'Any' : p.toUpperCase() }));

export function PortsField({ id, rule, onChange, compact = false }: { id: string; rule: FirewallRule; onChange: (v: string) => void; compact?: boolean }) {
  const disabled = rule.protocol === 'icmp' || rule.protocol === 'any';
  const invalid = !disabled && !isValidPorts(rule.ports);
  return (
    <>
      <Input
        id={id}
        list={`${id}-list`}
        mono
        aria-label="Ports"
        disabled={disabled}
        invalid={invalid}
        title={invalid ? 'Examples: 22 · 80,443 · 8000-8100' : undefined}
        value={disabled ? '' : rule.ports}
        placeholder={disabled ? 'n/a' : 'all ports'}
        onChange={(e) => onChange(e.target.value)}
        className={compact ? 'h-7 px-2 text-[11.5px]' : undefined}
      />
      <datalist id={`${id}-list`}>
        {COMMON_PORTS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </datalist>
      {!compact && invalid && <p className="mt-1 text-[11px] text-danger">Use 22, 80,443 or 8000-8100</p>}
    </>
  );
}
