import { useSyncExternalStore } from 'react';

const query = '(prefers-reduced-motion: reduce)';

/** True when the user asked the system to reduce motion. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
