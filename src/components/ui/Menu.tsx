import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn';

export interface MenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  description?: string;
  danger?: boolean;
  disabled?: boolean;
  checked?: boolean;
  onSelect?: () => void;
}

export type MenuEntry = MenuItem | 'separator' | { heading: string };

interface MenuListProps {
  items: MenuEntry[];
  onClose: () => void;
  className?: string;
}

export function MenuList({ items, onClose, className }: MenuListProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, []);
  const onKeyDown = (e: React.KeyboardEvent) => {
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    const idx = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      buttons[(idx + 1) % buttons.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      buttons[(idx - 1 + buttons.length) % buttons.length]?.focus();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  };
  return (
    <div
      ref={ref}
      role="menu"
      onKeyDown={onKeyDown}
      className={cn(
        'min-w-52 animate-pop-in rounded-xl border border-line bg-surface p-1 shadow-xl shadow-slate-900/10 dark:shadow-black/40',
        className,
      )}
    >
      {items.map((item, i) => {
        if (item === 'separator') return <div key={`s${i}`} className="my-1 h-px bg-line" />;
        if ('heading' in item)
          return (
            <div key={`h${i}`} className="px-2.5 pt-2 pb-1 text-[12px] font-medium text-subtle">
              {item.heading}
            </div>
          );
        return (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onSelect?.();
            }}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] outline-none disabled:opacity-40',
              item.danger ? 'text-danger hover:bg-red-500/10 focus:bg-red-500/10' : 'text-fg hover:bg-surface-2 focus:bg-surface-2',
            )}
          >
            <span className="flex w-4 shrink-0 items-center justify-center text-muted">{item.icon}</span>
            <span className="flex-1">
              <span className="block">{item.label}</span>
              {item.description && <span className="block text-xs text-subtle">{item.description}</span>}
            </span>
            {item.checked && <span className="text-primary">✓</span>}
            {item.shortcut && <span className="text-[11px] text-subtle">{item.shortcut}</span>}
          </button>
        );
      })}
    </div>
  );
}

interface DropdownProps {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  items: MenuEntry[];
  align?: 'start' | 'end';
}

/** Click-to-open dropdown menu anchored to its trigger. */
export function Dropdown({ trigger, items, align = 'start' }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const r = anchor.current.getBoundingClientRect();
    setPos({ x: align === 'start' ? r.left : r.right, y: r.bottom + 6 });
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (menu.current?.contains(e.target as Node) || anchor.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <>
      <span ref={anchor} className="inline-flex">
        {trigger({ open, toggle: () => setOpen((o) => !o) })}
      </span>
      {open &&
        createPortal(
          <div
            ref={menu}
            className="fixed z-[900]"
            style={{ left: pos.x, top: pos.y, transform: align === 'end' ? 'translateX(-100%)' : undefined }}
          >
            <MenuList items={items} onClose={() => setOpen(false)} />
          </div>,
          document.body,
        )}
    </>
  );
}
