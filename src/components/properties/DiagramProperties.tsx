import { MousePointer2 } from 'lucide-react';
import { useDiagram } from '../../store/diagramStore';
import { modKey } from '../../utils/misc';
import { FieldRow, Input, Switch, Textarea } from '../ui/Field';
import { Kbd } from '../ui/Kbd';
import { Section } from './NodeProperties';

export function DiagramProperties() {
  const metadata = useDiagram((s) => s.metadata);
  const settings = useDiagram((s) => s.settings);
  const counts = useDiagram((s) => `${s.nodes.length}|${s.edges.length}|${s.vlans.length}`).split('|');
  const rename = useDiagram((s) => s.renameProject);
  const setDescription = useDiagram((s) => s.setDescription);
  const setSettings = useDiagram((s) => s.setSettings);
  return (
    <div>
      <div className="border-b border-line px-4 py-4">
        <div className="text-[11px] font-semibold tracking-wider text-primary uppercase">Diagram</div>
        <div className="truncate text-[15px] font-semibold text-fg">{metadata.name}</div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          {[
            ['Elements', counts[0]],
            ['Links', counts[1]],
            ['VLANs', counts[2]],
          ].map(([label, n]) => (
            <div key={label} className="rounded-lg bg-surface-2 py-1.5">
              <div className="text-[15px] font-semibold text-fg">{n}</div>
              <div className="text-[10.5px] text-muted">{label}</div>
            </div>
          ))}
        </div>
      </div>
      <Section title="Project">
        <div className="space-y-3">
          <FieldRow label="Name" htmlFor="proj-name">
            <Input id="proj-name" value={metadata.name} onChange={(e) => rename(e.target.value)} />
          </FieldRow>
          <FieldRow label="Description" htmlFor="proj-desc">
            <Textarea id="proj-desc" rows={3} value={metadata.description ?? ''} placeholder="Scope, version, author…" onChange={(e) => setDescription(e.target.value)} />
          </FieldRow>
        </div>
      </Section>
      <Section title="Display">
        <div className="space-y-2.5">
          <Switch id="s-grid" label="Show grid" checked={settings.showGrid} onChange={(v) => setSettings({ showGrid: v })} />
          <Switch id="s-snap" label="Snap to grid" checked={settings.snapToGrid} onChange={(v) => setSettings({ snapToGrid: v })} />
          <Switch id="s-labels" label="Link labels" checked={settings.showEdgeLabels} onChange={(v) => setSettings({ showEdgeLabels: v })} />
          <Switch id="s-ports" label="Port names" checked={settings.showPortLabels} onChange={(v) => setSettings({ showPortLabels: v })} />
          <Switch id="s-mini" label="Minimap" checked={settings.showMinimap} onChange={(v) => setSettings({ showMinimap: v })} />
        </div>
      </Section>
      <Section title="Tips">
        <ul className="space-y-2 text-[12px] text-muted">
          <li className="flex gap-2"><MousePointer2 size={13} className="mt-0.5 shrink-0" />Drag from a node's edge dot to another node to connect them.</li>
          <li>Drop VMs, LXC and Docker hosts inside a hypervisor; drop equipment into a VLAN zone to assign it.</li>
          <li>Double-click a name to rename it inline.</li>
          <li className="flex flex-wrap items-center gap-1"><Kbd>Space</Kbd> + drag to pan · <Kbd>{modKey}</Kbd><Kbd>K</Kbd> to search · <Kbd>?</Kbd> for all shortcuts</li>
        </ul>
      </Section>
    </div>
  );
}
