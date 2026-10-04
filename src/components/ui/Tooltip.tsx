import { useCallback, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  content: ReactNode;
  children: ReactElement;
  side?: 'top' | 'bottom' | 'right' | 'left';
  delay?: number;
}

/** Lightweight tooltip rendered in a portal (never clipped by scroll containers). */
export function Tooltip({ content, children, side = 'bottom', delay = 350 }: TooltipProps) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const ref = useRef<HTMLSpanElement>(null);

  const show = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const el = ref.current?.firstElementChild ?? ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const map = {
        top: { x: r.left + r.width / 2, y: r.top - 8 },
        bottom: { x: r.left + r.width / 2, y: r.bottom + 8 },
        right: { x: r.right + 8, y: r.top + r.height / 2 },
        left: { x: r.left - 8, y: r.top + r.height / 2 },
      };
      setPos(map[side]);
    }, delay);
  }, [delay, side]);

  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    setPos(null);
  }, []);

  const transform = {
    top: 'translate(-50%, -100%)',
    bottom: 'translate(-50%, 0)',
    right: 'translate(0, -50%)',
    left: 'translate(-100%, -50%)',
  }[side];

  return (
    <span ref={ref} className="contents" onMouseEnter={show} onMouseLeave={hide} onMouseDown={hide} onFocus={show} onBlur={hide}>
      {children}
      {pos &&
        content &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-[1000] max-w-xs animate-fade-in rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white shadow-lg dark:bg-slate-700"
            style={{ left: pos.x, top: pos.y, transform }}
          >
            {content}
          </div>,
          document.body,
        )}
    </span>
  );
}
