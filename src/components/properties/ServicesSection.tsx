import { Check } from 'lucide-react';
import { useState } from 'react';
import { getDefinition } from '../../data/catalog';
import { SERVICES, servicesOf, SUGGESTED_SERVICES } from '../../data/services';
import { useDiagram } from '../../store/diagramStore';
import type { InfraNode } from '../../types';
import { alpha } from '../../utils/misc';
import { Icon } from '../icons/Icon';
import { cn } from '../ui/cn';

/** Extra roles of an equipment (DHCP, DNS, NAT…), shown as badges on its card. */
export function ServicesSection({ node }: { node: InfraNode }) {
  const update = useDiagram((s) => s.updateNodeProps);
  const [showAll, setShowAll] = useState(false);
  const active = servicesOf(node.data.props);
  const suggested = SUGGESTED_SERVICES[getDefinition(node.data.type).role] ?? [];
  const ordered = [...SERVICES].sort((a, b) => Number(suggested.includes(b.id)) - Number(suggested.includes(a.id)));
  const visible = showAll ? ordered : ordered.filter((s) => suggested.includes(s.id) || active.includes(s.id));
  const list = visible.length ? visible : ordered.slice(0, 6);
  const toggle = (id: string) =>
    update(node.id, { services: active.includes(id) ? active.filter((x) => x !== id) : [...active, id] });

  return (
    <section className="border-b border-line px-4 py-3.5">
      <div className="mb-1 flex items-center justify-between">
        <h4 className="text-[12.5px] font-semibold text-fg">Also acts as</h4>
        {active.length > 0 && <span className="text-[11px] text-subtle">{active.length} active</span>}
      </div>
      <p className="mb-2.5 text-[11.5px] leading-snug text-subtle">Extra roles of this equipment, shown as badges on the diagram.</p>
      <div className="flex flex-wrap gap-1.5">
        {list.map((s) => {
          const on = active.includes(s.id);
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={on}
              title={s.label}
              onClick={() => toggle(s.id)}
              className={cn('flex h-7 items-center gap-1.5 rounded-lg border px-2 text-[12px] font-medium transition-colors', on ? '' : 'border-line text-muted hover:text-fg')}
              style={on ? { background: alpha(s.color, 0.12), borderColor: alpha(s.color, 0.5), color: s.color } : undefined}
            >
              {on ? <Check size={12} strokeWidth={2.5} /> : <Icon name={s.icon} size={12} />}
              {s.label}
            </button>
          );
        })}
      </div>
      <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-2 text-[11.5px] font-medium text-primary hover:underline">
        {showAll ? 'Show suggested only' : `All services (${SERVICES.length})`}
      </button>
    </section>
  );
}
