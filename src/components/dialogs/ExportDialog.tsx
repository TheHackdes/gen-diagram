import { Download, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  backgroundOf,
  diagramHasRules,
  estimateExportSizes,
  exportDiagram,
  type ExportArea,
  type ExportBackground,
  type ExportContent,
  type ExportFormat,
  type ExportOptions,
  type ExportResolution,
  type ExportTheme,
} from '../../features/export/exportImage';
import { projectActions } from '../../features/projects/actions';
import { useDiagram } from '../../store/diagramStore';
import { useUi } from '../../store/uiStore';
import { Button } from '../ui/Button';
import { cn } from '../ui/cn';
import { Dialog } from '../ui/Dialog';
import { FieldRow, Input, RadioCards, Segmented } from '../ui/Field';

type Saved = Pick<ExportOptions, 'format' | 'resolution' | 'theme' | 'background' | 'backgroundColor' | 'content' | 'padding'>;
const STORAGE_KEY = 'infracanvas.export';

function loadSaved(): Partial<Saved> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Saved>;
  } catch {
    return {};
  }
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="mb-1.5 block text-xs font-medium text-muted">{children}</span>;
}

export function ExportDialog() {
  const open = useUi((s) => s.dialog === 'export');
  const appTheme = useUi((s) => s.theme);
  const close = () => useUi.getState().openDialog(null);
  const name = useDiagram((s) => s.metadata.name);
  const hasSelection = useDiagram((s) => s.nodes.some((n) => n.selected));
  const hasRules = useDiagram((s) => diagramHasRules(s.nodes));
  const saved = loadSaved();
  const [format, setFormat] = useState<ExportFormat>(saved.format ?? 'png');
  const [resolution, setResolution] = useState<ExportResolution>(saved.resolution ?? 'high');
  const [area, setArea] = useState<ExportArea>('all');
  const [theme, setTheme] = useState<ExportTheme>(saved.theme ?? appTheme);
  const [background, setBackground] = useState<ExportBackground>(saved.background ?? 'theme');
  const [backgroundColor, setBackgroundColor] = useState(saved.backgroundColor ?? '#f8fafc');
  const [content, setContent] = useState<ExportContent>(saved.content ?? 'all');
  const [padding, setPadding] = useState(saved.padding ?? 48);
  const [filename, setFilename] = useState(name);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setFilename(name);
      setArea(hasSelection ? 'selection' : 'all');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Content choices only matter when there are rules and a frame to crop.
  const contentEnabled = hasRules && area !== 'viewport';
  const effectiveContent: ExportContent = contentEnabled ? content : 'all';
  const sizes = open && format !== 'svg' ? estimateExportSizes({ area, resolution, padding, content: effectiveContent }) : [];
  const files = effectiveContent === 'separate' ? (format === 'pdf' ? 'one PDF with 2 pages' : '2 files') : '1 file';
  const preview = backgroundOf({ theme, background, backgroundColor });

  const run = async () => {
    setBusy(true);
    try {
      const options: ExportOptions = { format, resolution, area, theme, background, backgroundColor, content: effectiveContent, padding, filename: filename || name };
      await exportDiagram(options);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ format, resolution, theme, background, backgroundColor, content, padding } satisfies Saved));
      } catch {
        /* storage unavailable: settings are simply not remembered */
      }
      useUi.getState().toast(`Exported ${format.toUpperCase()} (${files})`, 'success');
      close();
    } catch (e) {
      useUi.getState().toast(e instanceof Error ? e.message : 'Export failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Export diagram"
      description="Only the diagram is exported — no toolbars or UI."
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={() => (projectActions.exportJson(), close())} className="mr-auto">
            Export project as JSON
          </Button>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" data-primary onClick={run} disabled={busy} icon={busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}>
            Export {format.toUpperCase()}
          </Button>
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <div>
            <Label>Format</Label>
            <Segmented
              value={format}
              onChange={setFormat}
              options={[
                { value: 'png', label: 'PNG' },
                { value: 'svg', label: 'SVG' },
                { value: 'pdf', label: 'PDF' },
              ]}
            />
          </div>
          {format !== 'svg' && (
            <div>
              <Label>Resolution</Label>
              <Segmented
                value={resolution}
                onChange={setResolution}
                options={[
                  { value: 'standard', label: 'Standard 1×' },
                  { value: 'high', label: 'High 2×' },
                  { value: '4k', label: '4K' },
                ]}
              />
              {sizes.length > 0 && <p className="mt-1.5 text-[11.5px] text-subtle">Output: {sizes.map((s) => `${s.width} × ${s.height} px`).join(' and ')}</p>}
            </div>
          )}
          <div>
            <Label>Theme of the drawing</Label>
            <Segmented
              value={theme}
              onChange={setTheme}
              options={[
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
          </div>
          <div>
            <Label>Background</Label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Segmented
                  value={background}
                  onChange={setBackground}
                  options={[
                    { value: 'transparent', label: 'Transparent' },
                    { value: 'theme', label: theme === 'dark' ? 'Dark' : 'White' },
                    { value: 'custom', label: 'Custom' },
                  ]}
                />
              </div>
              {background === 'custom' && (
                <input
                  type="color"
                  aria-label="Background colour"
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  className="h-8 w-10 shrink-0 cursor-pointer rounded border border-line bg-transparent"
                />
              )}
              <span
                aria-hidden="true"
                title="Background preview"
                className="h-8 w-8 shrink-0 rounded-md border border-line"
                style={
                  preview
                    ? { background: preview }
                    : { backgroundImage: 'repeating-conic-gradient(#cbd5e1 0% 25%, transparent 0% 50%)', backgroundSize: '10px 10px' }
                }
              />
            </div>
            {format === 'pdf' && background === 'transparent' && <p className="mt-1.5 text-[11.5px] text-subtle">PDF pages have no transparency: they appear white.</p>}
          </div>
          <div className="grid grid-cols-[1fr_96px] gap-2">
            <FieldRow label="File name" htmlFor="exp-name">
              <Input id="exp-name" value={filename} onChange={(e) => setFilename(e.target.value)} />
            </FieldRow>
            <FieldRow label="Margin (px)" htmlFor="exp-pad">
              <Input id="exp-pad" type="number" min={0} max={400} value={padding} onChange={(e) => setPadding(Math.max(0, Number(e.target.value) || 0))} />
            </FieldRow>
          </div>
        </div>
        <div className="space-y-4">
          {hasRules && (
            <div className={cn(!contentEnabled && 'opacity-60')}>
              <Label>Content</Label>
              <RadioCards
                name="export-content"
                value={effectiveContent}
                onChange={setContent}
                options={[
                  { value: 'all', label: 'Infrastructure and firewall rules', description: 'One image, rules table on the right.', disabled: !contentEnabled },
                  { value: 'infrastructure', label: 'Infrastructure only', description: 'Without the rules tables.', disabled: !contentEnabled },
                  { value: 'rules', label: 'Firewall rules only', description: 'The rules tables alone.', disabled: !contentEnabled },
                  {
                    value: 'separate',
                    label: 'Both, as separate images',
                    description: format === 'pdf' ? 'One PDF: infrastructure page + rules page.' : 'Two files: …-infrastructure and …-firewall-rules.',
                    disabled: !contentEnabled,
                  },
                ]}
              />
              {!contentEnabled && <p className="mt-1.5 text-[11.5px] text-subtle">The current viewport is exported as shown.</p>}
            </div>
          )}
          <div>
            <Label>Export area</Label>
            <RadioCards
              name="export-area"
              value={area}
              onChange={setArea}
              options={[
                { value: 'all', label: 'Entire diagram', description: 'Everything, cropped to content.' },
                { value: 'selection', label: 'Selected elements', description: hasSelection ? 'Selection and its contents.' : 'Select elements on the canvas first.', disabled: !hasSelection },
                { value: 'viewport', label: 'Current viewport', description: 'Exactly what is visible on screen.' },
              ]}
            />
          </div>
          {format === 'svg' && (
            <p className="rounded-lg bg-surface-2 px-3 py-2 text-[11.5px] leading-relaxed text-muted">
              SVG keeps text sharp at any size and opens in browsers, Confluence and most documentation tools. Some desktop vector editors do not support the
              embedded HTML text — use PDF for those.
            </p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
