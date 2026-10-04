import { useUi, type LeftTab } from '../../store/uiStore';
import { cn } from '../ui/cn';
import { LayersPanel } from './LayersPanel';
import { Library } from './Library';
import { NetworksPanel } from './NetworksPanel';

const TABS: { id: LeftTab; label: string }[] = [
  { id: 'library', label: 'Library' },
  { id: 'networks', label: 'VLANs' },
  { id: 'layers', label: 'Layers' },
];

export function LeftSidebar() {
  const tab = useUi((s) => s.leftTab);
  const setTab = useUi((s) => s.setLeftTab);
  return (
    <aside className="flex h-full w-full flex-col bg-surface" aria-label="Components">
      <div role="tablist" className="flex gap-1 border-b border-line px-2 pt-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              '-mb-px border-b-2 px-2.5 pt-1 pb-2 text-[12.5px] font-medium transition-colors',
              tab === t.id ? 'border-primary text-fg' : 'border-transparent text-muted hover:text-fg',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {tab === 'library' && <Library />}
        {tab === 'networks' && <NetworksPanel />}
        {tab === 'layers' && <LayersPanel />}
      </div>
    </aside>
  );
}
