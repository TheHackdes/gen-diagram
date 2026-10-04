import { ChevronRight, Search, X } from 'lucide-react';
import { useMemo, useState, type DragEvent } from 'react';
import { CATEGORIES, CATEGORY_BY_ID } from '../../data/categories';
import { colorOf, getDefinition, getLibraryPresets, searchLibrary } from '../../data/catalog';
import { getOperatingSystem } from '../../data/operatingSystems';
import { flowApi } from '../../features/canvas/flowApi';
import { CONNECTION_TYPES } from '../../features/connections/suggest';
import { useDiagram } from '../../store/diagramStore';
import { useUi } from '../../store/uiStore';
import type { CategoryId, ConnectionType, LibraryPreset } from '../../types';
import { alpha } from '../../utils/misc';
import { LIBRARY_MIME } from '../canvas/Canvas';
import { Icon } from '../icons/Icon';
import { cn } from '../ui/cn';
import { Tooltip } from '../ui/Tooltip';

function presetColor(p: LibraryPreset): string {
  if (p.osId) return getOperatingSystem(p.osId)?.color ?? '#0d9488';
  return colorOf(getDefinition(p.type));
}

function addAtCenter(p: LibraryPreset) {
  const inst = flowApi.instance;
  const el = document.querySelector('.react-flow');
  if (!inst || !el) return;
  const r = el.getBoundingClientRect();
  // Small jitter so repeated clicks do not stack exactly.
  const jitter = () => (Math.random() - 0.5) * 60;
  const at = inst.screenToFlowPosition({ x: r.left + r.width / 2 + jitter(), y: r.top + r.height / 2 + jitter() });
  useDiagram.getState().addPreset(p, at);
  if (window.innerWidth < 1024) useUi.getState().setLeftOpen(false);
}

function LibraryItem({ preset, compact }: { preset: LibraryPreset; compact?: boolean }) {
  const icon = preset.icon ?? getDefinition(preset.type).icon;
  const color = presetColor(preset);
  const onDragStart = (e: DragEvent) => {
    e.dataTransfer.setData(LIBRARY_MIME, preset.id);
    e.dataTransfer.effectAllowed = 'copy';
  };
  const desc = preset.description ?? getDefinition(preset.type).description;
  return (
    <Tooltip side="right" content={<span className="block max-w-56">{desc}<span className="block text-slate-400">Drag onto the canvas or click to add</span></span>}>
      <button
        type="button"
        draggable
        onDragStart={onDragStart}
        onClick={() => addAtCenter(preset)}
        className={cn(
          'group flex w-full cursor-grab items-center gap-2 rounded-lg border border-transparent px-1.5 py-1.5 text-left transition-colors hover:border-line hover:bg-surface-2 active:cursor-grabbing',
          compact && 'py-1',
        )}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md" style={{ background: alpha(color, 0.12), color }}>
          <Icon name={icon} size={15} brandColor={icon.startsWith('brand:')} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg">{preset.label}</span>
      </button>
    </Tooltip>
  );
}

function ConnectionPicker() {
  const value = useDiagram((s) => s.defaultConnType);
  const set = useDiagram((s) => s.setDefaultConnType);
  return (
    <div className="border-t border-line p-3">
      <label htmlFor="conn-type" className="mb-1.5 block text-[11px] font-semibold tracking-wide text-subtle uppercase">
        New links
      </label>
      <select
        id="conn-type"
        value={value}
        onChange={(e) => set(e.target.value as ConnectionType | 'auto')}
        className="h-8 w-full rounded-lg border border-line-strong bg-surface px-2 text-[12.5px] text-fg outline-none focus:border-primary"
      >
        <option value="auto">Automatic (smart detection)</option>
        {CONNECTION_TYPES.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Library() {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<CategoryId>>(() => new Set(['os', 'cloud', 'annotations', 'generic']));
  const customOs = useDiagram((s) => s.customOs);
  const presets = useMemo(() => getLibraryPresets().filter((p) => !p.searchOnly), [customOs]);
  const results = useMemo(() => searchLibrary(query), [query, customOs]);

  const toggle = (id: CategoryId) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="p-3 pb-2">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-subtle" />
          <input
            id="library-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setQuery('');
              if (e.key === 'Enter' && results[0]) addAtCenter(results[0]);
            }}
            placeholder="Search components…  ( / )"
            aria-label="Search components"
            className="h-8 w-full rounded-lg border border-line-strong bg-surface pr-7 pl-8 text-[13px] text-fg placeholder:text-subtle outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery('')}
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-subtle hover:text-fg"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {query ? (
          results.length ? (
            <div className="space-y-0.5">
              <div className="px-1.5 pt-1 pb-1.5 text-[11px] text-subtle">
                {results.length} result{results.length > 1 ? 's' : ''} · Enter adds the first one
              </div>
              {results.slice(0, 60).map((p) => (
                <div key={p.id} className="flex items-center gap-1">
                  <div className="min-w-0 flex-1">
                    <LibraryItem preset={p} />
                  </div>
                  <span className="shrink-0 pr-1.5 text-[10px] text-subtle">{CATEGORY_BY_ID[p.category].label.split(' ')[0]}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-3 py-8 text-center text-[13px] text-muted">No component matches “{query}”.</p>
          )
        ) : (
          CATEGORIES.map((cat) => {
            const items = presets.filter((p) => p.category === cat.id);
            if (!items.length) return null;
            const open = !collapsed.has(cat.id);
            return (
              <section key={cat.id} className="mb-1">
                <button
                  type="button"
                  onClick={() => toggle(cat.id)}
                  aria-expanded={open}
                  className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-[11.5px] font-semibold tracking-wide text-muted uppercase hover:text-fg"
                >
                  <ChevronRight size={13} className={cn('transition-transform', open && 'rotate-90')} />
                  <span className="h-2 w-2 rounded-full" style={{ background: cat.color }} />
                  <span className="flex-1">{cat.label}</span>
                  <span className="text-[10px] font-medium text-subtle">{items.length}</span>
                </button>
                {open && (
                  <div className="grid grid-cols-1 gap-0.5 pb-1 pl-1">
                    {items.map((p) => (
                      <LibraryItem key={p.id} preset={p} compact />
                    ))}
                    {cat.id === 'os' && (
                      <button
                        type="button"
                        onClick={() => useUi.getState().openDialog('customOs')}
                        className="mt-1 rounded-lg border border-dashed border-line-strong px-2 py-1.5 text-[12px] text-muted hover:border-primary hover:text-primary"
                      >
                        + Add a custom operating system
                      </button>
                    )}
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>
      <ConnectionPicker />
    </div>
  );
}
