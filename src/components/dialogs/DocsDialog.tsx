import { FileText, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { buildDocument, DOC_SECTIONS, type DocSectionId } from '../../features/docs/document';
import { toHtml, toMarkdown } from '../../features/docs/render';
import { captureDiagram, type ExportTheme } from '../../features/export/exportImage';
import { validateDiagram } from '../../features/validation/validate';
import { useDiagram } from '../../store/diagramStore';
import { useUi } from '../../store/uiStore';
import { downloadBlob, slugify } from '../../utils/misc';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { FieldRow, Input, Segmented } from '../ui/Field';

type DocFormat = 'html' | 'markdown';
interface Saved {
  format: DocFormat;
  sections: DocSectionId[];
  theme: ExportTheme;
}
const STORAGE_KEY = 'infracanvas.docs';

function loadSaved(): Partial<Saved> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Saved>;
  } catch {
    return {};
  }
}

/** Generate the infrastructure documentation of the project (HTML or Markdown). */
export function DocsDialog() {
  const open = useUi((s) => s.dialog === 'docs');
  const name = useDiagram((s) => s.metadata.name);
  const close = () => useUi.getState().openDialog(null);
  const saved = loadSaved();
  const [format, setFormat] = useState<DocFormat>(saved.format ?? 'html');
  const [sections, setSections] = useState<DocSectionId[]>(saved.sections ?? DOC_SECTIONS.map((s) => s.id));
  const [theme, setTheme] = useState<ExportTheme>(saved.theme ?? 'light');
  const [filename, setFilename] = useState(name);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setFilename(name);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: DocSectionId) => setSections((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const run = async () => {
    setBusy(true);
    try {
      const st = useDiagram.getState();
      const doc = buildDocument(
        {
          name: st.metadata.name,
          description: st.metadata.description,
          nodes: st.nodes,
          edges: st.edges,
          vlans: st.vlans,
          bonds: st.bonds,
          issues: validateDiagram(st.nodes, st.edges, st.vlans, st.bonds),
        },
        sections,
      );
      const image = sections.includes('diagram') ? await captureDiagram(theme) : null;
      const base = slugify(filename || name);
      if (format === 'html') {
        downloadBlob(new Blob([toHtml(doc, image?.png)], { type: 'text/html' }), `${base}.html`);
      } else {
        // Markdown references the picture, downloaded next to it.
        downloadBlob(new Blob([toMarkdown(doc, image ? `${base}-diagram.png` : undefined)], { type: 'text/markdown' }), `${base}.md`);
        if (image) {
          await new Promise((r) => setTimeout(r, 400));
          downloadBlob(await (await fetch(image.png)).blob(), `${base}-diagram.png`);
        }
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ format, sections, theme } satisfies Saved));
      } catch {
        /* settings are simply not remembered */
      }
      useUi.getState().toast(`Documentation exported (${format === 'html' ? 'HTML' : 'Markdown'})`, 'success');
      close();
    } catch (e) {
      useUi.getState().toast(e instanceof Error ? e.message : 'Could not generate the documentation', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Export documentation"
      description="A document generated from the diagram: inventory, addressing plan, VLANs, links, rules and issues."
      size="lg"
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button
            variant="primary"
            data-primary
            onClick={run}
            disabled={busy || sections.length === 0}
            icon={busy ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
          >
            Export {format === 'html' ? 'HTML' : 'Markdown'}
          </Button>
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <div>
            <span className="mb-1.5 block text-xs font-medium text-muted">Format</span>
            <Segmented
              value={format}
              onChange={setFormat}
              options={[
                { value: 'html', label: 'HTML' },
                { value: 'markdown', label: 'Markdown' },
              ]}
            />
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-subtle">
              {format === 'html'
                ? 'One self-contained file with the diagram embedded. Open it in a browser and print it to get a PDF.'
                : 'For wikis and Git repositories. The diagram is saved as a PNG next to the .md file.'}
            </p>
          </div>
          {sections.includes('diagram') && (
            <div>
              <span className="mb-1.5 block text-xs font-medium text-muted">Diagram theme</span>
              <Segmented
                value={theme}
                onChange={setTheme}
                options={[
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
              />
              <p className="mt-1.5 text-[11.5px] text-subtle">The picture shows the current view.</p>
            </div>
          )}
          <FieldRow label="File name" htmlFor="doc-name">
            <Input id="doc-name" value={filename} onChange={(e) => setFilename(e.target.value)} />
          </FieldRow>
        </div>
        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-muted">Sections</legend>
          <div className="space-y-0.5">
            {DOC_SECTIONS.map((s) => (
              <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-[13px] text-fg hover:bg-surface-2">
                <input type="checkbox" checked={sections.includes(s.id)} onChange={() => toggle(s.id)} className="accent-[var(--primary)]" />
                {s.label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </Dialog>
  );
}
