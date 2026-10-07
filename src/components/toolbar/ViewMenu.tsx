import { ChevronDown, Eye, EyeOff } from 'lucide-react';
import { isFiltered, LAYERS, VIEW_PRESETS, viewOf } from '../../features/canvas/views';
import { useDiagram } from '../../store/diagramStore';
import type { LayerId, ViewSettings } from '../../types';
import { Button } from '../ui/Button';
import { Dropdown, type MenuEntry } from '../ui/Menu';

const setView = (view: ViewSettings) => useDiagram.getState().setSettings({ view });

/** Views (physical, network, applications, security) and individual layers. */
export function ViewMenu() {
  const view = useDiagram((s) => viewOf(s.settings));
  const hidden = new Set(view.hidden);
  const toggle = (id: LayerId) => {
    const next = hidden.has(id) ? view.hidden.filter((x) => x !== id) : [...view.hidden, id];
    // A hand-picked set of layers is a custom view (security keeps its dimming).
    const preset = VIEW_PRESETS.find((p) => p.id !== 'security' && p.hidden.length === next.length && p.hidden.every((x) => next.includes(x)));
    setView({ preset: view.preset === 'security' ? 'security' : (preset?.id ?? 'custom'), hidden: next });
  };
  const items: MenuEntry[] = [
    { heading: 'View' },
    ...VIEW_PRESETS.map((p) => ({ id: `view-${p.id}`, label: p.label, description: p.description, checked: view.preset === p.id, onSelect: () => setView({ preset: p.id, hidden: [...p.hidden] }) })),
    'separator',
    { heading: 'Show' },
    ...LAYERS.map((l) => ({ id: `layer-${l.id}`, label: l.label, checked: !hidden.has(l.id), keepOpen: true, onSelect: () => toggle(l.id) })),
  ];
  const current = view.preset === 'custom' ? 'Custom' : (VIEW_PRESETS.find((p) => p.id === view.preset)?.label ?? 'Everything');
  const filtered = isFiltered(view);
  return (
    <Dropdown
      items={items}
      trigger={({ toggle: open, open: isOpen }) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={open}
          icon={filtered ? <EyeOff size={15} /> : <Eye size={15} />}
          aria-label={`View: ${current}`}
          className={isOpen ? 'bg-surface-2 text-fg' : filtered ? 'bg-primary-soft text-primary hover:bg-primary-soft' : ''}
        >
          <span className="hidden md:inline">{filtered ? current : 'View'}</span>
          <ChevronDown size={13} />
        </Button>
      )}
    />
  );
}
