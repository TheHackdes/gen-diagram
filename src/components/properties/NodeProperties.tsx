import { ChevronDown, CopyPlus, KeyRound, Lock, LockOpen, LogOut, Plus, RotateCcw, ShieldCheck, Trash, Wifi, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { CATEGORY_BY_ID } from '../../data/categories';
import { colorOf, getDefinition, getPreset } from '../../data/catalog';
import { CONNECTION_STYLE } from '../../features/connections/suggest';
import { useDiagram } from '../../store/diagramStore';
import { getOperatingSystem } from '../../data/operatingSystems';
import type { Capability, InfraNode } from '../../types';
import { alpha, str } from '../../utils/misc';
import { Icon } from '../icons/Icon';
import { Button, IconButton } from '../ui/Button';
import { cn } from '../ui/cn';
import { FieldRow, Input, Segmented, Switch } from '../ui/Field';
import { analyzeBond } from '../../features/connections/bonds';
import { hasRules } from '../../features/firewall/rules';
import { DEFAULT_DISPLAY, DETAIL_OPTIONS, displayedKeys } from '../../features/nodes/details';
import { COMPACT_FIELDS, compactFieldsOf, DEFAULT_COMPACT_FIELDS, type CompactField } from '../../features/nodes/compact';
import { inCompactHost } from '../../features/nodes/ips';
import { ARRANGE_MODES, arrangementOf, canArrange, canCompact, DEFAULT_GAP, type ArrangeMode } from '../../features/nodes/arrange';
import { FieldEditor } from './FieldEditor';
import { FirewallRulesSection } from './rules/FirewallRulesSection';
import { ServicesSection } from './ServicesSection';

const ACCENTS = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2', '#db2777', '#475569'];

export function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-3.5">
      <div className="mb-2.5 flex items-center justify-between">
        <h4 className="text-[12.5px] font-semibold text-fg">{title}</h4>
        {action}
      </div>
      {children}
    </section>
  );
}

function QuickAdd({ node }: { node: InfraNode }) {
  const def = getDefinition(node.data.type);
  const addChild = useDiagram((s) => s.addChild);
  if (!def.quickAdd?.length) return null;
  return (
    <Section title={def.role === 'docker-host' ? 'Add containers' : 'Add to this host'}>
      <div className="grid grid-cols-2 gap-1.5">
        {def.quickAdd.map((type) => {
          const d = getDefinition(type);
          const color = colorOf(d);
          return (
            <button
              key={type}
              type="button"
              onClick={() => addChild(node.id, type)}
              className="flex items-center gap-2 rounded-lg border border-line px-2 py-1.5 text-left text-[12px] text-fg transition-colors hover:border-primary hover:bg-primary-soft"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md" style={{ background: alpha(color, 0.12), color }}>
                <Icon name={d.icon} size={13} brandColor={d.icon.startsWith('brand:')} />
              </span>
              <span className="min-w-0 flex-1 truncate">{getPreset(type)?.label ?? d.label}</span>
              <Plus size={12} className="text-subtle" />
            </button>
          );
        })}
      </div>
    </Section>
  );
}

const CAPABILITY_INFO: Record<Capability, { title: string; toggle: string; icon: React.ReactNode; color: string; hint: string }> = {
  vpn: {
    title: 'Integrated VPN',
    toggle: 'vpn',
    icon: <KeyRound size={14} />,
    color: '#059669',
    hint: 'This equipment also terminates VPN tunnels — no separate VPN gateway needed.',
  },
  firewall: {
    title: 'Host firewall',
    toggle: 'fw',
    icon: <ShieldCheck size={14} />,
    color: '#dc2626',
    hint: 'Firewall running directly on this machine (nftables, ufw, Windows Firewall…).',
  },
  wifi: {
    title: 'Integrated Wi-Fi AP',
    toggle: 'wifi',
    icon: <Wifi size={14} />,
    color: '#0ea5e9',
    hint: 'This equipment is also a Wi-Fi access point (e.g. a router with built-in Wi-Fi).',
  },
};

/** Sensible defaults when a service is switched on. */
function enableDefaults(node: InfraNode, capability: Capability): Record<string, unknown> {
  const p = node.data.props;
  if (capability === 'vpn') {
    return { vpn: true, vpnProtocol: str(p.vpnProtocol) || 'WireGuard', vpnMode: str(p.vpnMode) || 'Site-to-site', vpnEndpoint: str(p.vpnEndpoint) || str(p.publicIp) };
  }
  if (capability === 'wifi') {
    return { wifi: true, ssid: str(p.ssid) || 'Corp', band: str(p.band) || 'Dual band', wifiStandard: str(p.wifiStandard) || 'Wi-Fi 6 (ax)', wifiSecurity: str(p.wifiSecurity) || 'WPA3-Personal' };
  }
  const family = getOperatingSystem(p.os)?.family;
  const product = family === 'windows' ? 'Windows Defender Firewall' : family === 'bsd' || family === 'macos' ? 'pf' : p.os === 'ubuntu' ? 'ufw' : ['rhel', 'rocky', 'alma', 'fedora', 'centos'].includes(str(p.os)) ? 'firewalld' : 'nftables';
  return { fw: true, fwProduct: str(p.fwProduct) || product, fwPolicy: str(p.fwPolicy) || 'Default deny' };
}

/** Choose which details of a service are written on the card. */
function DisplayPicker({ node, capability }: { node: InfraNode; capability: Capability }) {
  const update = useDiagram((s) => s.updateNodeProps);
  const options = DETAIL_OPTIONS[capability];
  if (!options) return null;
  const shown = displayedKeys(node.data.props);
  const toggle = (key: string) => update(node.id, { display: shown.includes(key) ? shown.filter((k) => k !== key) : [...shown, key] });
  return (
    <div>
      <span className="mb-1 flex items-center gap-1 text-xs font-medium text-muted">
        <Eye size={12} /> Show on diagram
      </span>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => {
          const on = shown.includes(o.key);
          const empty = !str(node.data.props[o.key]);
          return (
            <button
              key={o.key}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(o.key)}
              title={empty ? `${o.label} is empty` : undefined}
              className={cn(
                'flex h-6 items-center gap-1 rounded-md border px-1.5 text-[11.5px] transition-colors',
                on ? 'border-primary bg-primary-soft text-primary' : 'border-line text-muted hover:text-fg',
                empty && 'opacity-60',
              )}
            >
              {on ? <Eye size={11} /> : <EyeOff size={11} />}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CapabilitySection({ node, capability }: { node: InfraNode; capability: Capability }) {
  const def = getDefinition(node.data.type);
  const update = useDiagram((s) => s.updateNodeProps);
  const info = CAPABILITY_INFO[capability];
  const enabled = node.data.props[info.toggle] === true;
  const fields = def.fields.filter((f) => f.section === capability && f.type !== 'boolean');
  return (
    <section className="border-b border-line px-4 py-3.5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: alpha(info.color, enabled ? 0.14 : 0.07), color: enabled ? info.color : 'var(--text-subtle)' }}>
          {info.icon}
        </span>
        <div className="min-w-0 flex-1">
          <Switch
            id={`cap-${node.id}-${capability}`}
            label={<span className="font-medium">{info.title}</span>}
            checked={enabled}
            onChange={(v) =>
              update(
                node.id,
                v
                  ? {
                      ...enableDefaults(node, capability),
                      display: [...new Set([...displayedKeys(node.data.props), ...(DEFAULT_DISPLAY[capability] ?? [])])],
                    }
                  : { [info.toggle]: false },
              )
            }
          />
        </div>
      </div>
      {!enabled && <p className="mt-1.5 pl-[38px] text-[11.5px] leading-snug text-subtle">{info.hint}</p>}
      {enabled && (
        <div className="mt-3 animate-fade-in space-y-3">
          {fields.map((f) => (
            <FieldEditor key={f.key} node={node} field={f} />
          ))}
          <DisplayPicker node={node} capability={capability} />
        </div>
      )}
    </section>
  );
}

/** Number field where an empty value means "automatic". */
function CountInput({ id, value, placeholder, onChange }: { id: string; value: number; placeholder: string; onChange: (v: number | undefined) => void }) {
  return (
    <Input
      id={id}
      type="number"
      min={0}
      inputMode="numeric"
      value={value || ''}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === '' ? undefined : Math.max(0, Math.floor(Number(e.target.value))) || undefined)}
    />
  );
}

/** How the members of a group / zone are placed: by hand, list, row or grid. */
function ArrangeControls({ node, compact }: { node: InfraNode; compact: boolean }) {
  const update = useDiagram((s) => s.updateNodeProps);
  const a = arrangementOf(node);
  const set = (patch: Record<string, unknown>) => update(node.id, patch);
  return (
    <div className="mb-3.5 space-y-3">
      <FieldRow label="Arrange members">
        <Segmented<ArrangeMode>
          value={a.mode}
          onChange={(mode) => set({ arrange: mode })}
          options={ARRANGE_MODES.map((m) => ({ value: m.value, label: m.label, title: m.title }))}
        />
      </FieldRow>
      {a.mode === 'grid' && (
        <div className="grid grid-cols-2 gap-2">
          <FieldRow label="Columns" htmlFor={`cols-${node.id}`}>
            <CountInput id={`cols-${node.id}`} value={a.columns} placeholder="Auto" onChange={(v) => set({ arrangeColumns: v })} />
          </FieldRow>
          <FieldRow label="Rows" htmlFor={`rows-${node.id}`}>
            <CountInput id={`rows-${node.id}`} value={a.rows} placeholder="Auto" onChange={(v) => set({ arrangeRows: v })} />
          </FieldRow>
        </div>
      )}
      {a.mode !== 'free' && !compact && (
        <FieldRow label="Spacing" htmlFor={`gap-${node.id}`}>
          <Input
            id={`gap-${node.id}`}
            type="number"
            min={0}
            max={200}
            value={a.gap}
            onChange={(e) => set({ arrangeGap: e.target.value === '' ? DEFAULT_GAP : Math.max(0, Number(e.target.value)) })}
          />
        </FieldRow>
      )}
      <p className="text-[11.5px] leading-snug text-subtle">
        {a.mode === 'free'
          ? 'Members stay where you drop them.'
          : compact
            ? a.mode === 'grid'
              ? 'Compact lines are split into columns (filled top to bottom).'
              : 'Compact lines are stacked in one column.'
            : 'The group sizes itself to its members. Drag a member onto another place to reorder it.'}
      </p>
    </div>
  );
}

function CompactSection({ node }: { node: InfraNode }) {
  const setCompact = useDiagram((s) => s.setCompact);
  const update = useDiagram((s) => s.updateNodeProps);
  const nested = useDiagram((s) => {
    const byId = new Map(s.nodes.map((n) => [n.id, n]));
    return inCompactHost(node, byId);
  });
  if (nested) return null;
  const on = node.data.props.compact === true;
  const fields = compactFieldsOf(node);
  const toggle = (key: CompactField) => update(node.id, { compactFields: fields.includes(key) ? fields.filter((k) => k !== key) : [...fields, key] });
  const isDefault = fields.length === DEFAULT_COMPACT_FIELDS.length && DEFAULT_COMPACT_FIELDS.every((k) => fields.includes(k));
  const def = getDefinition(node.data.type);
  const members = def.kind === 'container' ? (def.role === 'docker-host' ? 'container' : 'VM, LXC or container') : 'member';
  return (
    <Section title="Display">
      {canArrange(node) && <ArrangeControls node={node} compact={on} />}
      <Switch id={`compact-${node.id}`} label="Compact view" checked={on} onChange={(v) => setCompact(node.id, v)} />
      <p className="mt-1.5 text-[11.5px] leading-snug text-subtle">One line per {members}. Drag a line to reorder it.</p>
      {on && (
        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-medium text-muted">Show on each line</span>
            {!isDefault && (
              <button type="button" onClick={() => update(node.id, { compactFields: DEFAULT_COMPACT_FIELDS })} className="text-[11px] text-subtle hover:text-fg">
                Reset
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            <span className="flex h-6 items-center gap-1 rounded-md border border-line bg-surface-2 px-1.5 text-[11.5px] text-subtle" title="Always shown">
              <Eye size={11} /> Name
            </span>
            {COMPACT_FIELDS.map((f) => {
              const active = fields.includes(f.key);
              return (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggle(f.key)}
                  className={cn(
                    'flex h-6 items-center gap-1 rounded-md border px-1.5 text-[11.5px] transition-colors',
                    active ? 'border-primary bg-primary-soft text-primary' : 'border-line text-muted hover:text-fg',
                  )}
                >
                  {active ? <Eye size={11} /> : <EyeOff size={11} />}
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Section>
  );
}

function Connections({ node }: { node: InfraNode }) {
  const edges = useDiagram((s) => s.edges);
  const nodes = useDiagram((s) => s.nodes);
  const select = useDiagram((s) => s.select);
  const bonds = useDiagram((s) => s.bonds);
  const mine = edges.filter((e) => e.source === node.id || e.target === node.id);
  // Name of the aggregate on this device's side (e.g. "bond0" on the host, "Po1" on the switch).
  const bondName = (e: (typeof edges)[number]) => {
    const b = bonds.find((x) => x.id === e.data?.bondId);
    if (!b) return '';
    const [, sideB] = analyzeBond(b, edges, nodes).sides;
    return b.peerName && sideB.includes(node.id) ? b.peerName : b.name;
  };
  if (!mine.length) return null;
  return (
    <Section title={`Connections (${mine.length})`}>
      <ul className="space-y-1">
        {mine.map((e) => {
          const outgoing = e.source === node.id;
          const peer = nodes.find((n) => n.id === (outgoing ? e.target : e.source));
          const localPort = outgoing ? e.data?.sourcePort : e.data?.targetPort;
          const remotePort = outgoing ? e.data?.targetPort : e.data?.sourcePort;
          const st = CONNECTION_STYLE[e.data?.connType ?? 'ethernet'];
          return (
            <li key={e.id}>
              <button type="button" onClick={() => select([], [e.id])} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] hover:bg-surface-2">
                <svg width="16" height="6" className="shrink-0">
                  <line x1="0" y1="3" x2="16" y2="3" stroke={st.color} strokeWidth={2} strokeDasharray={st.dash} />
                </svg>
                <span className="font-mono text-[11px] text-muted">{localPort || '—'}</span>
                <span className="text-subtle">→</span>
                <span className="min-w-0 flex-1 truncate font-medium text-fg">{peer?.data.name}</span>
                {remotePort && <span className="font-mono text-[10.5px] text-subtle">{remotePort}</span>}
                {bondName(e) && <span className="rounded bg-surface-2 px-1 font-mono text-[10px] text-muted">{bondName(e)}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

export function NodeProperties({ node }: { node: InfraNode }) {
  const def = getDefinition(node.data.type);
  const updateNode = useDiagram((s) => s.updateNode);
  const duplicate = useDiagram((s) => s.duplicateSelection);
  const toggleLock = useDiagram((s) => s.toggleLock);
  const deleteElements = useDiagram((s) => s.deleteElements);
  const detach = useDiagram((s) => s.detachFromParent);
  const parentName = useDiagram((s) => (node.parentId ? s.nodes.find((n) => n.id === node.parentId)?.data.name : undefined));
  const [advanced, setAdvanced] = useState(false);
  const color = node.data.color ?? colorOf(def);
  const basic = def.fields.filter((f) => !f.advanced && !f.section);
  const extra = def.fields.filter((f) => f.advanced && !f.section);
  const filledAdvanced = extra.filter((f) => str(node.data.props[f.key])).length;
  const named = def.kind !== 'annotation';

  return (
    <div>
      <div className="flex items-start gap-3 border-b border-line px-4 py-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: alpha(color, 0.12), color }}>
          <Icon name={def.icon} size={20} brandColor={def.icon.startsWith('brand:')} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-medium" style={{ color }}>
            {def.label}
          </div>
          <div className="truncate text-[15px] font-semibold text-fg">{named ? node.data.name : def.label}</div>
          <div className="text-[11.5px] text-muted">
            {CATEGORY_BY_ID[def.category].label}
            {parentName && (
              <>
                {' · in '}
                <span className="font-medium text-fg">{parentName}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <QuickAdd node={node} />
      {canCompact(node) && <CompactSection node={node} />}

      <Section title="Properties">
        <div className="space-y-3">
          {named && (
            <FieldRow label="Name" htmlFor={`name-${node.id}`}>
              <Input id={`name-${node.id}`} value={node.data.name} onChange={(e) => updateNode(node.id, { name: e.target.value })} />
            </FieldRow>
          )}
          {basic.map((f) => (
            <FieldEditor key={f.key} node={node} field={f} />
          ))}
        </div>
        {extra.length > 0 && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setAdvanced((a) => !a)}
              aria-expanded={advanced}
              className="flex w-full items-center gap-1.5 rounded-lg py-1 text-[12.5px] font-medium text-muted hover:text-fg"
            >
              <ChevronDown size={14} className={cn('transition-transform', !advanced && '-rotate-90')} />
              Advanced properties
              <span className="ml-auto text-[11px] font-normal text-subtle">
                {filledAdvanced}/{extra.length} set
              </span>
            </button>
            {advanced && (
              <div className="mt-2 animate-fade-in space-y-3">
                {extra.map((f) => (
                  <FieldEditor key={f.key} node={node} field={f} />
                ))}
              </div>
            )}
          </div>
        )}
      </Section>

      {def.capabilities?.map((c) => <CapabilitySection key={c} node={node} capability={c} />)}
      {hasRules(node) && <FirewallRulesSection node={node} />}
      {def.fields.some((f) => f.key === 'ip') && <ServicesSection node={node} />}

      <Connections node={node} />

      {def.kind !== 'annotation' && (
        <Section
          title="Accent color"
          action={
            node.data.color ? (
              <button type="button" onClick={() => updateNode(node.id, { color: undefined })} className="flex items-center gap-1 text-[11px] text-muted hover:text-fg">
                <RotateCcw size={11} /> Reset
              </button>
            ) : undefined
          }
        >
          <div className="flex flex-wrap gap-1.5">
            {ACCENTS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Accent ${c}`}
                onClick={() => updateNode(node.id, { color: c })}
                className={cn('h-6 w-6 rounded-md border-2', node.data.color === c ? 'border-fg' : 'border-transparent')}
                style={{ background: c }}
              />
            ))}
          </div>
        </Section>
      )}

      <div className="flex items-center gap-1.5 px-4 py-3">
        <Button size="sm" icon={<CopyPlus size={14} />} onClick={() => duplicate()}>
          Duplicate
        </Button>
        {node.parentId && (
          <IconButton label="Move out of container" onClick={() => detach(node.id)}>
            <LogOut size={15} />
          </IconButton>
        )}
        <IconButton label={node.data.locked ? 'Unlock' : 'Lock position'} active={!!node.data.locked} onClick={() => toggleLock([node.id])}>
          {node.data.locked ? <Lock size={15} /> : <LockOpen size={15} />}
        </IconButton>
        <span className="flex-1" />
        <IconButton label="Delete" disabled={!!node.data.locked} onClick={() => deleteElements([node.id])} className="hover:!text-danger">
          <Trash size={15} />
        </IconButton>
      </div>
    </div>
  );
}
