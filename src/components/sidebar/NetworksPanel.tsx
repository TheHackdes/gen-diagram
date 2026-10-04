import { ChevronDown, LayoutTemplate, Plus, Trash } from 'lucide-react';
import { useState } from 'react';
import { useDiagram } from '../../store/diagramStore';
import { useUi } from '../../store/uiStore';
import type { Vlan } from '../../types';
import { firstHost, isValidCidr, isValidIPv4 } from '../../utils/ip';
import { str } from '../../utils/misc';
import { VLAN_COLORS } from '../../data/templates/builder';
import { Button, IconButton } from '../ui/Button';
import { cn } from '../ui/cn';
import { FieldRow, Input, Textarea } from '../ui/Field';

function VlanEditor({ vlan }: { vlan: Vlan }) {
  const update = useDiagram((s) => s.updateVlan);
  const remove = useDiagram((s) => s.removeVlan);
  const place = useDiagram((s) => s.placeVlanZone);
  const duplicateId = useDiagram((s) => s.vlans.filter((v) => v.id === vlan.id).length > 1);
  const [idDraft, setIdDraft] = useState(String(vlan.id));
  const idNum = Number(idDraft);
  const idError = !Number.isInteger(idNum) || idNum < 1 || idNum > 4094 ? '1 – 4094' : duplicateId ? 'Already used' : null;

  return (
    <div className="space-y-2.5 border-t border-line px-3 pt-3 pb-3">
      <div className="grid grid-cols-[72px_1fr] gap-2">
        <FieldRow label="ID" htmlFor={`vid-${vlan.uid}`} error={idError}>
          <Input
            id={`vid-${vlan.uid}`}
            value={idDraft}
            inputMode="numeric"
            invalid={!!idError}
            onChange={(e) => {
              setIdDraft(e.target.value);
              const n = Number(e.target.value);
              if (Number.isInteger(n) && n >= 1 && n <= 4094) update(vlan.uid, { id: n });
            }}
          />
        </FieldRow>
        <FieldRow label="Name" htmlFor={`vname-${vlan.uid}`}>
          <Input id={`vname-${vlan.uid}`} value={vlan.name} onChange={(e) => update(vlan.uid, { name: e.target.value })} />
        </FieldRow>
      </div>
      <FieldRow label="Subnet" htmlFor={`vsub-${vlan.uid}`} error={vlan.subnet && !isValidCidr(vlan.subnet) ? 'Invalid CIDR' : null}>
        <Input
          id={`vsub-${vlan.uid}`}
          mono
          value={vlan.subnet ?? ''}
          placeholder="192.168.20.0/24"
          invalid={!!vlan.subnet && !isValidCidr(vlan.subnet)}
          onChange={(e) => update(vlan.uid, { subnet: e.target.value })}
          onBlur={() => {
            if (!vlan.gateway && vlan.subnet) {
              const gw = firstHost(vlan.subnet);
              if (gw) update(vlan.uid, { gateway: gw });
            }
          }}
        />
      </FieldRow>
      <FieldRow label="Gateway" htmlFor={`vgw-${vlan.uid}`} error={vlan.gateway && !isValidIPv4(vlan.gateway) ? 'Invalid IP' : null}>
        <Input
          id={`vgw-${vlan.uid}`}
          mono
          value={vlan.gateway ?? ''}
          placeholder="192.168.20.1"
          invalid={!!vlan.gateway && !isValidIPv4(vlan.gateway)}
          onChange={(e) => update(vlan.uid, { gateway: e.target.value })}
        />
      </FieldRow>
      <FieldRow label="Description" htmlFor={`vdesc-${vlan.uid}`}>
        <Textarea id={`vdesc-${vlan.uid}`} rows={2} value={vlan.description ?? ''} onChange={(e) => update(vlan.uid, { description: e.target.value })} />
      </FieldRow>
      <div>
        <span className="mb-1 block text-xs font-medium text-muted">Color</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {VLAN_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Color ${c}`}
              onClick={() => update(vlan.uid, { color: c })}
              className={cn('h-6 w-6 rounded-md border-2 transition-transform hover:scale-110', vlan.color === c ? 'border-fg' : 'border-transparent')}
              style={{ background: c }}
            />
          ))}
          <input
            type="color"
            aria-label="Custom color"
            value={vlan.color}
            onChange={(e) => update(vlan.uid, { color: e.target.value })}
            className="h-6 w-7 cursor-pointer rounded border border-line bg-transparent"
          />
        </div>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <Button size="xs" variant="secondary" icon={<LayoutTemplate size={13} />} onClick={() => place(vlan.uid)}>
          Place zone on canvas
        </Button>
        <span className="flex-1" />
        <IconButton
          size="sm"
          label="Delete VLAN"
          onClick={() =>
            useUi.getState().askConfirm({
              title: `Delete VLAN ${vlan.id}?`,
              message: 'Equipment assigned to this VLAN will be unassigned. Zones remain on the canvas.',
              confirmLabel: 'Delete VLAN',
              danger: true,
              onConfirm: () => remove(vlan.uid),
            })
          }
        >
          <Trash size={14} />
        </IconButton>
      </div>
    </div>
  );
}

export function NetworksPanel() {
  const vlans = useDiagram((s) => s.vlans);
  const usage = useDiagram((s) => {
    const m: Record<string, number> = {};
    for (const n of s.nodes) {
      const v = str(n.data.props.vlan);
      if (v) m[v] = (m[v] ?? 0) + 1;
    }
    return JSON.stringify(m);
  });
  const counts = JSON.parse(usage) as Record<string, number>;
  const addVlan = useDiagram((s) => s.addVlan);
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between p-3 pb-2">
        <div>
          <h3 className="text-[13px] font-semibold text-fg">VLANs</h3>
          <p className="text-[11.5px] text-muted">Shared across the whole diagram.</p>
        </div>
        <Button size="xs" variant="primary" icon={<Plus size={13} />} onClick={() => setOpen(addVlan().uid)}>
          New VLAN
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 pb-3">
        {vlans.length === 0 && (
          <div className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-[12.5px] text-muted">
            No VLAN yet. Create one, then assign it to equipment, links and zones.
          </div>
        )}
        {vlans.map((v) => (
          <div key={v.uid} className={cn('overflow-hidden rounded-xl border bg-surface', open === v.uid ? 'border-line-strong shadow-sm' : 'border-line')}>
            <button
              type="button"
              onClick={() => setOpen(open === v.uid ? null : v.uid)}
              aria-expanded={open === v.uid}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-2"
            >
              <span className="flex h-7 min-w-9 items-center justify-center rounded-md px-1 text-[11px] font-bold text-white" style={{ background: v.color }}>
                {v.id}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-fg">{v.name}</span>
                <span className="block truncate font-mono text-[10.5px] text-muted">{v.subnet || 'no subnet'}</span>
              </span>
              <span className="text-[10.5px] text-subtle">{counts[String(v.id)] ?? 0}</span>
              <ChevronDown size={14} className={cn('text-subtle transition-transform', open === v.uid && 'rotate-180')} />
            </button>
            {open === v.uid && <VlanEditor vlan={v} />}
          </div>
        ))}
      </div>
    </div>
  );
}
