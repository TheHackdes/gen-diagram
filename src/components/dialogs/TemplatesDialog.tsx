import { useMemo } from 'react';
import { TEMPLATES, type TemplateInfo } from '../../data/templates';
import { projectActions } from '../../features/projects/actions';
import { useDiagram } from '../../store/diagramStore';
import { useUi } from '../../store/uiStore';
import { Dialog } from '../ui/Dialog';
import { TemplatePreview } from './TemplatePreview';

export function startFromTemplate(t: TemplateInfo) {
  useDiagram.getState().newProject(t.id);
  useUi.getState().setView('workspace');
  useUi.getState().openDialog(null);
}

export function TemplateGrid({ onPick }: { onPick: (t: TemplateInfo) => void }) {
  const previews = useMemo(() => Object.fromEntries(TEMPLATES.map((t) => [t.id, t.build()])), []);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {TEMPLATES.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onPick(t)}
          className="group flex flex-col overflow-hidden rounded-xl border border-line bg-surface text-left transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-lg hover:shadow-primary/5"
        >
          <div className="h-32 border-b border-line bg-canvas p-3">
            <TemplatePreview content={previews[t.id]} />
          </div>
          <div className="p-3">
            <div className="text-[13.5px] font-semibold text-fg group-hover:text-primary">{t.name}</div>
            <div className="mt-0.5 text-[12px] leading-snug text-muted">{t.description}</div>
            {t.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {t.tags.map((tag) => (
                  <span key={tag} className="rounded bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-medium text-muted">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

export function TemplatesDialog() {
  const open = useUi((s) => s.dialog === 'templates');
  return (
    <Dialog open={open} onClose={() => useUi.getState().openDialog(null)} title="New project" description="Start from a template or a blank canvas." size="xl">
      {open && <TemplateGrid onPick={(t) => projectActions.guardUnsaved(() => startFromTemplate(t))} />}
    </Dialog>
  );
}
