import { FolderOpen, Trash, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { projectActions } from '../../features/projects/actions';
import { fromProjectFile } from '../../features/projects/serialization';
import { deleteProject, listProjects, loadProjectFile, type ProjectSummary } from '../../features/projects/storage';
import { useDiagram } from '../../store/diagramStore';
import { useUi } from '../../store/uiStore';
import { Button, IconButton } from '../ui/Button';
import { cn } from '../ui/cn';
import { Dialog } from '../ui/Dialog';
import { ProjectThumbnail } from './ProjectThumbnail';

export function openProject(id: string): boolean {
  const file = loadProjectFile(id);
  if (!file) {
    useUi.getState().toast('This project could not be loaded', 'error');
    return false;
  }
  try {
    useDiagram.getState().loadContent(fromProjectFile(file));
    useUi.getState().setView('workspace');
    return true;
  } catch {
    useUi.getState().toast('This project file is corrupted', 'error');
    return false;
  }
}

export function confirmDeleteProject(p: ProjectSummary, after: () => void) {
  useUi.getState().askConfirm({
    title: `Delete “${p.name}”?`,
    message: 'This permanently removes the project from this browser. Export it to JSON first if you want a backup.',
    confirmLabel: 'Delete project',
    danger: true,
    onConfirm: () => {
      deleteProject(p.id);
      after();
    },
  });
}

export function OpenProjectDialog() {
  const open = useUi((s) => s.dialog === 'open');
  const currentId = useDiagram((s) => s.metadata.id);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const refresh = () => setProjects(listProjects());
  useEffect(() => {
    if (open) refresh();
  }, [open]);
  const close = () => useUi.getState().openDialog(null);

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Open project"
      description="Projects are stored locally in this browser."
      size="lg"
      footer={
        <Button icon={<Upload size={14} />} onClick={() => (close(), projectActions.importJson())} className="mr-auto">
          Import JSON file
        </Button>
      }
    >
      {projects.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-muted">No saved project yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {projects.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2">
              <div className="h-12 w-20 shrink-0 overflow-hidden rounded-md border border-line bg-canvas">
                <ProjectThumbnail preview={p.preview} links={p.previewLinks} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-fg">
                  {p.name}
                  {p.id === currentId && <span className="ml-2 rounded bg-primary-soft px-1.5 text-[10px] font-semibold text-primary">open</span>}
                </div>
                <div className="text-[11.5px] text-muted">
                  {p.nodeCount} elements · {p.edgeCount} links · {new Date(p.updatedAt).toLocaleString()}
                </div>
              </div>
              <Button
                size="sm"
                icon={<FolderOpen size={14} />}
                className={cn(p.id === currentId && 'invisible')}
                onClick={() => projectActions.guardUnsaved(() => openProject(p.id) && close())}
              >
                Open
              </Button>
              <IconButton label="Delete project" disabled={p.id === currentId} onClick={() => confirmDeleteProject(p, refresh)}>
                <Trash size={15} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
