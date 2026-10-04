import { Download, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { estimateExportSize, exportDiagram, type ExportArea, type ExportBackground, type ExportFormat, type ExportResolution } from '../../features/export/exportImage';
import { projectActions } from '../../features/projects/actions';
import { useDiagram } from '../../store/diagramStore';
import { useUi } from '../../store/uiStore';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { FieldRow, Input, RadioCards, Segmented } from '../ui/Field';

export function ExportDialog() {
  const open = useUi((s) => s.dialog === 'export');
  const close = () => useUi.getState().openDialog(null);
  const name = useDiagram((s) => s.metadata.name);
  const hasSelection = useDiagram((s) => s.nodes.some((n) => n.selected));
  const [format, setFormat] = useState<ExportFormat>('png');
  const [resolution, setResolution] = useState<ExportResolution>('high');
  const [area, setArea] = useState<ExportArea>('all');
  const [background, setBackground] = useState<ExportBackground>('white');
  const [padding, setPadding] = useState(48);
  const [filename, setFilename] = useState(name);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setFilename(name);
      setArea(hasSelection ? 'selection' : 'all');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const size = open && format !== 'svg' ? estimateExportSize({ area, resolution, padding }) : null;

  const run = async () => {
    setBusy(true);
    try {
      await exportDiagram({ format, resolution, area, background, padding, filename: filename || name });
      useUi.getState().toast(`Exported ${format.toUpperCase()}`, 'success');
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
      size="lg"
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
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-4">
          <div>
            <span className="mb-1.5 block text-xs font-medium text-muted">Format</span>
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
              <span className="mb-1.5 block text-xs font-medium text-muted">Resolution</span>
              <Segmented
                value={resolution}
                onChange={setResolution}
                options={[
                  { value: 'standard', label: 'Standard 1×' },
                  { value: 'high', label: 'High 2×' },
                  { value: '4k', label: '4K' },
                ]}
              />
              {size && (
                <p className="mt-1.5 text-[11.5px] text-subtle">
                  Output: {size.width} × {size.height} px
                </p>
              )}
            </div>
          )}
          <div>
            <span className="mb-1.5 block text-xs font-medium text-muted">Background</span>
            <Segmented
              value={background}
              onChange={setBackground}
              options={[
                { value: 'transparent', label: 'Transparent' },
                { value: 'white', label: 'White' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
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
        <div>
          <span className="mb-1.5 block text-xs font-medium text-muted">Export area</span>
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
          {format === 'svg' && (
            <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-[11.5px] leading-relaxed text-muted">
              SVG keeps text sharp at any size and opens in browsers, Confluence and most documentation tools. Some desktop vector editors
              do not support the embedded HTML text — use PDF for those.
            </p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
