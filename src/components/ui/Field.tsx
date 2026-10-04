import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from './cn';

const CONTROL =
  'w-full rounded-lg border bg-surface px-2.5 text-[13px] text-fg placeholder:text-subtle transition-colors outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; mono?: boolean }>(
  function Input({ className, invalid, mono, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cn(CONTROL, 'h-8', invalid ? 'border-danger' : 'border-line-strong', mono && 'font-mono text-[12px]', className)}
        {...rest}
      />
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...rest },
  ref,
) {
  return <textarea ref={ref} className={cn(CONTROL, 'min-h-16 resize-y border-line-strong py-1.5 leading-snug', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={cn(CONTROL, 'h-8 cursor-pointer border-line-strong pr-7', className)} {...rest}>
      {children}
    </select>
  );
});

export function Label({ children, htmlFor, hint }: { children: ReactNode; htmlFor?: string; hint?: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 flex items-center justify-between text-xs font-medium text-muted">
      <span>{children}</span>
      {hint && <span className="font-normal text-subtle">{hint}</span>}
    </label>
  );
}

export function FieldRow({ label, htmlFor, children, error, hint }: { label: ReactNode; htmlFor?: string; children: ReactNode; error?: string | null; hint?: ReactNode }) {
  return (
    <div>
      <Label htmlFor={htmlFor} hint={hint}>
        {label}
      </Label>
      {children}
      {error && <p className="mt-1 text-[11px] text-danger">{error}</p>}
    </div>
  );
}

export function Switch({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; id?: string }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-3 text-[13px] text-fg select-none">
      {label && <span>{label}</span>}
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-surface-3',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
            checked && 'translate-x-4',
          )}
        />
      </button>
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'sm',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; title?: string }[];
  size?: 'sm' | 'xs';
}) {
  return (
    <div role="radiogroup" className="flex w-full rounded-lg bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-md font-medium transition-colors',
            size === 'sm' ? 'h-7 text-[12px]' : 'h-6 text-[11px]',
            value === o.value ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function RadioCards<T extends string>({
  value,
  onChange,
  options,
  name,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; description?: ReactNode; disabled?: boolean }[];
  name: string;
}) {
  return (
    <div className="grid gap-2" role="radiogroup">
      {options.map((o) => (
        <label
          key={o.value}
          className={cn(
            'flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 transition-colors',
            value === o.value ? 'border-primary bg-primary-soft' : 'border-line hover:bg-surface-2',
            o.disabled && 'pointer-events-none opacity-50',
          )}
        >
          <input
            type="radio"
            name={name}
            className="mt-0.5 accent-[var(--primary)]"
            checked={value === o.value}
            disabled={o.disabled}
            onChange={() => onChange(o.value)}
          />
          <span>
            <span className="block text-[13px] font-medium text-fg">{o.label}</span>
            {o.description && <span className="block text-xs text-muted">{o.description}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}
