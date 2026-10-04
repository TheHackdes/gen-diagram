import { twMerge } from 'tailwind-merge';

/**
 * Join class names; conflicting Tailwind utilities are resolved in favour of
 * the last one (e.g. a component's `h-8` overridden by a caller's `h-7`).
 */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return twMerge(parts.filter(Boolean).join(' '));
}
