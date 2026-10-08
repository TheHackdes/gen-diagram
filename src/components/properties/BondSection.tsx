import { ChevronDown, CircleAlert, Info, Link2, Plus, TriangleAlert, Unlink } from 'lucide-react';
import { useState } from 'react';
import { analyzeBond, BOND_MODES, bondMembers, bondSuggestions, bondTitle, canJoinBond, memberTargets, modeInfo, suggestBondMode } from '../../features/connections/bonds';
import { parallelEdges } from '../../features/connections/parallel';
import { isBondable } from '../../features/connections/suggest';
import { useDiagram } from '../../store/diagramStore';
import type { Bond, BondModeId, InfraEdge, IssueSeverity } from '../../types';
import { Button } from '../ui/Button';
import { Dropdown, type MenuEntry } from '../ui/Menu';
import { cn } from '../ui/cn';
import { FieldRow, Input, Select } from '../ui/Field';
import { Section } from './NodeProperties';

const SEVERITY_ICON: Record<IssueSeverity, React.ReactNode> = {
  error: <CircleAlert size={13} className="mt-px shrink-0 text-danger" />,
  warning: <TriangleAlert size={13} className="mt-px shrink-0 text-warning" />,
  info: <Info size={13} className="mt-px shrink-0 text-primary" />,
};

const isPhysical = isBondable;

/** Links drawn between the same two devices. */
export function ParallelLinksSection({ edge }: { edge: InfraEdge }) {
  const edges = useDiagram((s) => s.edges);
  const bonds = useDiagram((s) => s.bonds);
  const select = useDiagram((s) => s.select);
  const addParallel = useDiagram((s) => s.addParallelLink);
  const group = parallelEdges(edges, edge);
  if (group.length < 2)
    return (
      <Section title="Parallel links">
        <p className="mb-2 text-[11.5px] leading-snug text-subtle">A second link between the same devices adds redundancy or bandwidth.</p>
        <Button size="xs" icon={<Plus size={13} />} onClick={() => addParallel(edge.id)}>
          Add parallel link
        </Button>
      </Section>
    );
  return (
    <Section title={`Parallel links (${group.length})`}>
      <ul className="mb-2 space-y-0.5">
        {group.map((e, i) => {
          const forward = e.source === edge.source;
          const bond = bonds.find((b) => b.id === e.data?.bondId);
          return (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => select([], [e.id])}
                aria-current={e.id === edge.id}
                className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[12px]', e.id === edge.id ? 'bg-primary-soft text-primary' : 'text-fg hover:bg-surface-2')}
              >
                <span className="w-3 text-[10.5px] text-subtle">{i + 1}</span>
                <span className="font-mono text-[11px]">{(forward ? e.data?.sourcePort : e.data?.targetPort) || '—'}</span>
                <span className="text-subtle">↔</span>
                <span className="font-mono text-[11px]">{(forward ? e.data?.targetPort : e.data?.sourcePort) || '—'}</span>
                {bond && <span className="rounded bg-surface-2 px-1 font-mono text-[10px] text-muted">{bond.name}</span>}
                <span className="ml-auto text-[11px] text-muted">{e.data?.speed}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <Button size="xs" icon={<Plus size={13} />} onClick={() => addParallel(edge.id)}>
        Add parallel link
      </Button>
    </Section>
  );
}

function BondDetails({ bond, edge }: { bond: Bond; edge: InfraEdge }) {
  const edges = useDiagram((s) => s.edges);
  const nodes = useDiagram((s) => s.nodes);
  const updateBond = useDiagram((s) => s.updateBond);
  const removeFromBond = useDiagram((s) => s.removeFromBond);
  const deleteBond = useDiagram((s) => s.deleteBond);
  const addMember = useDiagram((s) => s.addBondMember);
  const name = (id: string) => nodes.find((n) => n.id === id)?.data.name ?? '?';
  const select = useDiagram((s) => s.select);
  const analysis = analyzeBond(bond, edges, nodes);
  // New members can go to any device of the other side, or to its stack / MLAG peers.
  const targets = memberTargets(bond, edges, nodes);
  const memberItems: MenuEntry[] = targets.map((t) => {
    const parallel = (t.from === edge.source && t.to === edge.target) || (t.from === edge.target && t.to === edge.source);
    return {
      id: `${t.from}>${t.to}`,
      label: `${name(t.from)} → ${name(t.to)}`,
      description: parallel ? 'Same devices as this link' : analysis.sides.flat().includes(t.to) && analysis.sides.flat().includes(t.from) ? undefined : 'Stack / MLAG peer',
      onSelect: () => addMember(bond.id, t.from, t.to),
    };
  });
  const info = modeInfo(bond.mode);
  const physical = analysis.members.every(isPhysical);
  const modes = physical ? BOND_MODES : BOND_MODES.filter((m) => m.kind === 'redundancy');

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <FieldRow label="Name" htmlFor={`bn-${bond.id}`}>
          <Input id={`bn-${bond.id}`} mono value={bond.name} onChange={(e) => updateBond(bond.id, { name: e.target.value })} />
        </FieldRow>
        <FieldRow label="Name on the other side" htmlFor={`bp-${bond.id}`}>
          <Input id={`bp-${bond.id}`} mono value={bond.peerName ?? ''} placeholder="Po10" onChange={(e) => updateBond(bond.id, { peerName: e.target.value })} />
        </FieldRow>
      </div>
      <FieldRow label="Mode" htmlFor={`bm-${bond.id}`} help={info.help}>
        <Select id={`bm-${bond.id}`} value={bond.mode} onChange={(e) => updateBond(bond.id, { mode: e.target.value as BondModeId })}>
          {modes.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </Select>
      </FieldRow>

      <div className="grid grid-cols-2 gap-2 text-[11.5px]">
        {analysis.sides.map((side, i) => (
          <div key={i} className="rounded-lg bg-surface-2 px-2 py-1.5">
            <div className="text-[10.5px] text-subtle">{i === 0 ? bond.name || 'Side A' : bond.peerName || 'Other side'}</div>
            <div className="font-medium text-fg">{side.map(name).sort((x, y) => x.localeCompare(y)).join(' + ') || '—'}</div>
          </div>
        ))}
      </div>

      <div>
        <div className="mb-1 flex items-baseline justify-between text-xs font-medium text-muted">
          <span>Member links ({analysis.members.length})</span>
          <span className="font-normal text-subtle">{analysis.capacity}</span>
        </div>
        <ul className="space-y-0.5">
          {analysis.members.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => select([], [m.id])}
                aria-current={m.id === edge.id}
                className={cn('flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[11.5px]', m.id === edge.id ? 'bg-primary-soft text-primary' : 'text-fg hover:bg-surface-2')}
              >
                <span className="truncate">{name(m.source)}</span>
                <span className="font-mono text-[10.5px] text-muted">{m.data?.sourcePort}</span>
                <span className="text-subtle">→</span>
                <span className="truncate">{name(m.target)}</span>
                <span className="font-mono text-[10.5px] text-muted">{m.data?.targetPort}</span>
                <span className="ml-auto shrink-0 text-[10.5px] text-subtle">{m.data?.speed}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {analysis.problems.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-line p-2">
          {analysis.problems.map((p, i) => (
            <li key={i} className="flex gap-1.5 text-[11.5px] leading-snug text-fg">
              {SEVERITY_ICON[p.severity]}
              {p.message.replace(`${bondTitle(bond)}: `, '')}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-1.5">
        <Dropdown
          items={memberItems.length ? memberItems : [{ id: 'none', label: 'No valid member for this mode', disabled: true }]}
          trigger={({ open, toggle }) => (
            <Button size="xs" icon={<Plus size={13} />} onClick={toggle} aria-expanded={open} title="New member link, on the next free ports">
              Add member link <ChevronDown size={12} />
            </Button>
          )}
        />
        <Button size="xs" variant="ghost" icon={<Unlink size={13} />} onClick={() => removeFromBond([edge.id])}>
          Remove this link
        </Button>
        <Button size="xs" variant="ghost" onClick={() => deleteBond(bond.id)} className="hover:!text-danger">
          Dissolve
        </Button>
      </div>
    </div>
  );
}

/**
 * Aggregate / redundancy group of a link. Members may join different devices
 * (server → two switches of an MLAG pair, stack ↔ stack…).
 */
export function BondSection({ edge }: { edge: InfraEdge }) {
  const edges = useDiagram((s) => s.edges);
  const nodes = useDiagram((s) => s.nodes);
  const bonds = useDiagram((s) => s.bonds);
  const createBond = useDiagram((s) => s.createBond);
  const addToBond = useDiagram((s) => s.addToBond);
  const bond = bonds.find((b) => b.id === edge.data?.bondId);
  const physical = isPhysical(edge);
  const suggestions = bond ? [] : bondSuggestions(edge, edges, nodes);
  // Parallel links are checked by default: that is the classic bond.
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const chosen = picked ?? new Set(suggestions.filter((x) => x.reason === 'parallel').map((x) => x.edge.id));
  const members = [edge, ...suggestions.filter((x) => chosen.has(x.edge.id)).map((x) => x.edge)];
  const mode = modeInfo(suggestBondMode(members, nodes));
  // Bonds this link can join without breaking their rules (any devices for redundancy groups).
  const candidates = bonds.filter((b) => b.id !== bond?.id && canJoinBond(b, edge, edges, nodes));
  const name = (id: string) => nodes.find((n) => n.id === id)?.data.name ?? '?';
  const nameOf = (b: Bond) => {
    const peers = new Set(bondMembers(b.id, edges).flatMap((m) => [m.source, m.target]));
    return `${bondTitle(b)} (${[...peers].map(name).join(', ')})`;
  };
  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };
  const REASON = { parallel: 'same devices', 'shared-device': 'same device', group: 'same stack / MLAG' } as const;

  return (
    <Section title={bond ? 'Aggregate' : physical ? 'Bond / link aggregation' : 'Redundancy group'}>
      {bond ? (
        <BondDetails bond={bond} edge={edge} />
      ) : (
        <div className="space-y-3">
          <p className="text-[11.5px] leading-snug text-subtle">
            {physical
              ? 'Group links into one bond. Members can join different devices: a host to both switches of an MLAG pair, a stack to an MLAG pair…'
              : 'Mark redundant paths (dual WAN, backup VPN…) as one group.'}
          </p>
          {suggestions.length > 0 && (
            <fieldset>
              <legend className="mb-1 text-xs font-medium text-muted">Bond with</legend>
              <ul className="space-y-0.5">
                {suggestions.map((x) => {
                  const e = x.edge;
                  return (
                    <li key={e.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-[11.5px] text-fg hover:bg-surface-2">
                        <input type="checkbox" className="accent-[var(--primary)]" checked={chosen.has(e.id)} onChange={() => toggle(e.id)} />
                        <span className="min-w-0 truncate">
                          {name(e.source)} <span className="font-mono text-[10.5px] text-muted">{e.data?.sourcePort}</span> → {name(e.target)}{' '}
                          <span className="font-mono text-[10.5px] text-muted">{e.data?.targetPort}</span>
                        </span>
                        <span className="ml-auto shrink-0 text-[10.5px] text-subtle">{REASON[x.reason]}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="xs" variant="primary" icon={<Link2 size={13} />} onClick={() => createBond(members.map((e) => e.id), { mode: mode.id })}>
              {physical ? 'Create bond' : 'Create group'}
              {members.length > 1 ? ` (${members.length} links)` : ''}
            </Button>
            <span className="text-[11px] text-subtle">
              Mode: <span className="font-medium text-muted">{mode.label}</span>
            </span>
          </div>
          {candidates.length > 0 && (
            <div>
              <span className="mb-1 block text-xs font-medium text-muted">Or add this link to</span>
              <div className="space-y-1">
                {candidates.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => addToBond(b.id, [edge.id])}
                    className="flex w-full items-center gap-1.5 rounded-lg border border-line px-2 py-1.5 text-left text-[12px] text-fg hover:border-primary hover:bg-primary-soft"
                  >
                    <Plus size={12} className="text-primary" />
                    <span className="truncate">{nameOf(b)}</span>
                    <span className="ml-auto shrink-0 text-[10.5px] text-subtle">{modeInfo(b.mode).short}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
