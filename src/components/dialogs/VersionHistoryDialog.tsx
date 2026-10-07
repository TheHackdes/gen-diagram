import { Bookmark, Download, History, Pencil, RotateCcw, Trash } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { projectActions } from '../../features/projects/actions';
import { addVersion, deleteVersion, historyAvailable, listVersions, loadVersion, renameVersion, type VersionSummary } from '../../features/projects/storage';
import { useDiagram } from '../../store/diagramStore';
import { useUi } from '../../store/uiStore';
import { downloadBlob, slugify } from '../../utils/misc';
import { Button, IconButton } from '../ui/Button';
import { cn } from '../ui/cn';
import { Dialog } from '../ui/Dialog';

const KIND_LABEL: Record<VersionSummary['kind'], string> = { auto: 'Autosave', manual: 'Saved', restore: 'Before restore' };

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

function delta(n: number, unit: string) {
  if (!n) return null;
  return (
    <span className={n > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-danger'}>
      {n > 0 ? '+' : '−'}
      {Math.abs(n)} {unit}
    </span>
  );
}

/** Saved versions of the open project: restore, download, name or delete them. */
export function VersionHistoryDialog() {
  const open = useUi((s) => s.dialog === 'history');
  const projectId = useDiagram((s) => s.metadata.id);
  const projectName = useDiagram((s) => s.metadata.name);
  const [versions, setVersions] = useState<VersionSummary[] | null>(null);
  const close = () => useUi.getState().openDialog(null);

  const refresh = useCallback(() => {
    listVersions(projectId).then(setVersions, () => setVersions([]));
  }, [projectId]);
  useEffect(() => {
    if (open) refresh();
    else setVersions(null);
  }, [open, refresh]);

  const saveNamed = () =>
    useUi.getState().askPrompt({
      title: 'Save a named version',
      label: 'Version name',
      initial: '',
      confirmLabel: 'Save version',
      onSubmit: async (label) => {
        const st = useDiagram.getState();
        st.save('none');
        await addVersion(st.exportFile(), 'manual', label.trim() || undefined);
        useUi.getState().toast(`Version “${label}” saved`, 'success');
        refresh();
      },
    });

  const restore = (v: VersionSummary) =>
    useUi.getState().askConfirm({
      title: 'Restore this version?',
      message: `The diagram goes back to ${day(v.savedAt)}, ${time(v.savedAt)}. The current state is kept in the history, so this can be undone.`,
      confirmLabel: 'Restore',
      onConfirm: async () => {
        await projectActions.restoreVersion(v);
        close();
      },
    });

  const download = async (v: VersionSummary) => {
    const file = await loadVersion(v.id);
    if (!file) return;
    const stamp = v.savedAt.slice(0, 16).replace(/[T:]/g, '-');
    downloadBlob(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }), `${slugify(projectName)}-${stamp}.infracanvas.json`);
  };

  const rename = (v: VersionSummary) =>
    useUi.getState().askPrompt({
      title: 'Name this version',
      label: 'Version name',
      initial: v.label ?? '',
      confirmLabel: 'Rename',
      onSubmit: async (label) => {
        await renameVersion(v.id, label);
        refresh();
      },
    });

  const remove = (v: VersionSummary) =>
    useUi.getState().askConfirm({
      title: 'Delete this version?',
      message: 'It is removed from the history of this project.',
      confirmLabel: 'Delete version',
      danger: true,
      onConfirm: async () => {
        await deleteVersion(v.id);
        refresh();
      },
    });

  // Group by day, newest first.
  const groups: { day: string; items: { v: VersionSummary; older?: VersionSummary }[] }[] = [];
  (versions ?? []).forEach((v, i, all) => {
    const d = day(v.savedAt);
    if (groups.at(-1)?.day !== d) groups.push({ day: d, items: [] });
    groups.at(-1)!.items.push({ v, older: all[i + 1] });
  });

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Version history"
      description="Versions are kept in this browser: one when you save, and one every 10 minutes while you edit."
      size="lg"
      footer={
        <>
          <Button icon={<Bookmark size={14} />} onClick={saveNamed} disabled={!historyAvailable()} className="mr-auto">
            Save a named version…
          </Button>
          <Button onClick={close}>Close</Button>
        </>
      }
    >
      {!historyAvailable() ? (
        <p className="py-8 text-center text-[13px] text-muted">This browser does not allow IndexedDB here: projects are saved, but without history.</p>
      ) : versions === null ? (
        <p className="py-8 text-center text-[13px] text-muted">Loading…</p>
      ) : versions.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <History size={22} className="text-subtle" />
          <p className="text-[13px] text-muted">No version yet. Save the project (Ctrl/⌘ S) to record one.</p>
        </div>
      ) : (
        <div className="max-h-[56vh] space-y-4 overflow-auto pr-1">
          {groups.map((g) => (
            <section key={g.day}>
              <h3 className="mb-1 text-[11.5px] font-semibold text-muted first-letter:uppercase">{g.day}</h3>
              <ol className="divide-y divide-line rounded-lg border border-line">
                {g.items.map(({ v, older }) => (
                  <li key={v.id} className="group flex items-center gap-3 px-3 py-2">
                    <span className="w-12 shrink-0 font-mono text-[12px] text-fg tabular-nums">{time(v.savedAt)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        {v.label ? (
                          <span className="truncate text-[13px] font-medium text-fg">{v.label}</span>
                        ) : (
                          <span className="text-[13px] text-muted">{KIND_LABEL[v.kind]}</span>
                        )}
                        {v.label && <span className={cn('rounded px-1.5 text-[10px] font-semibold', 'bg-surface-2 text-muted')}>{KIND_LABEL[v.kind]}</span>}
                      </div>
                      <div className="flex gap-2 text-[11.5px] text-subtle">
                        <span>
                          {v.nodeCount} elements · {v.edgeCount} links
                        </span>
                        {older && delta(v.nodeCount - older.nodeCount, 'el.')}
                        {older && delta(v.edgeCount - older.edgeCount, 'links')}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5 opacity-70 group-focus-within:opacity-100 group-hover:opacity-100">
                      <IconButton size="sm" label="Name this version" onClick={() => rename(v)}>
                        <Pencil size={13} />
                      </IconButton>
                      <IconButton size="sm" label="Download as JSON" onClick={() => download(v)}>
                        <Download size={13} />
                      </IconButton>
                      <IconButton size="sm" label="Delete version" onClick={() => remove(v)}>
                        <Trash size={13} />
                      </IconButton>
                    </div>
                    <Button size="sm" icon={<RotateCcw size={13} />} onClick={() => restore(v)}>
                      Restore
                    </Button>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </Dialog>
  );
}
