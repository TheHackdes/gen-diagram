import { useDiagram } from '../../store/diagramStore';
import { useUi } from '../../store/uiStore';
import { downloadBlob, slugify } from '../../utils/misc';
import { ProjectFormatError } from './serialization';
import { StorageQuotaError } from './storage';

/** User-facing project commands shared by the toolbar, menus and shortcuts. */
export const projectActions = {
  save() {
    try {
      useDiagram.getState().save();
      useUi.getState().toast('Project saved', 'success');
    } catch (e) {
      useUi.getState().toast(e instanceof StorageQuotaError ? 'Browser storage is full — export to JSON instead.' : 'Could not save the project', 'error');
    }
  },
  saveAs() {
    const current = useDiagram.getState().metadata.name;
    useUi.getState().askPrompt({
      title: 'Save as',
      label: 'Project name',
      initial: `${current} (copy)`,
      confirmLabel: 'Save copy',
      onSubmit: (name) => {
        useDiagram.getState().saveAs(name);
        useUi.getState().toast(`Saved as “${name}”`, 'success');
      },
    });
  },
  duplicate() {
    const current = useDiagram.getState().metadata.name;
    useDiagram.getState().saveAs(`${current} (copy)`);
    useUi.getState().toast('Project duplicated — you are now editing the copy', 'success');
  },
  exportJson() {
    const file = useDiagram.getState().exportFile();
    downloadBlob(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }), `${slugify(file.metadata.name)}.infracanvas.json`);
  },
  importJson() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        const raw = JSON.parse(await f.text()) as unknown;
        useDiagram.getState().importFile(raw);
        useUi.getState().setView('workspace');
        useUi.getState().toast(`Imported “${useDiagram.getState().metadata.name}”`, 'success');
      } catch (e) {
        const msg = e instanceof ProjectFormatError ? e.message : 'This file is not valid JSON.';
        useUi.getState().toast(msg, 'error');
      }
    };
    input.click();
  },
  /** Run `fn` after confirming if there are unsaved changes. */
  guardUnsaved(fn: () => void) {
    if (!useDiagram.getState().dirty) return fn();
    useUi.getState().askConfirm({
      title: 'Unsaved changes',
      message: 'Save the current project before continuing?',
      confirmLabel: 'Save and continue',
      onConfirm: () => {
        useDiagram.getState().save();
        fn();
      },
    });
  },
};
