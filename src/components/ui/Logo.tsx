import { cn } from './cn';

export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#2563eb" />
      <path d="M16 9.5v4.5M10 18v-2h12v2" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="12" y="5" width="8" height="5" rx="1.5" fill="#fff" />
      <rect x="6" y="18" width="8" height="5" rx="1.5" fill="#fff" opacity="0.92" />
      <rect x="18" y="18" width="8" height="5" rx="1.5" fill="#fff" opacity="0.92" />
    </svg>
  );
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark />
      {!compact && (
        <span className="text-[15px] font-semibold tracking-tight text-fg">
          Infra<span className="text-primary">Canvas</span>
        </span>
      )}
    </span>
  );
}
