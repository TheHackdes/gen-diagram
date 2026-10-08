import { ArrowLeftRight, Trash } from 'lucide-react';
import { getDefinition } from '../../data/catalog';
import { CONNECTION_TYPES, interfaceVlans, isSwitching, nextPort } from '../../features/connections/suggest';
import { interfacesOf, subInterface } from '../../features/nodes/ips';
import type { InfraEdge, InfraEdgeData, InfraNode } from '../../types';
import { useDiagram } from '../../store/diagramStore';
import { Icon } from '../icons/Icon';
import { Button, IconButton } from '../ui/Button';
import { cn } from '../ui/cn';
import { FieldRow, Input, Segmented, Textarea } from '../ui/Field';
import { VlanMultiSelect, VlanSelect } from './FieldEditor';
import { BondSection, ParallelLinksSection } from './BondSection';
import { Section } from './NodeProperties';

/**
 * Interfaces the device declares in its address list, to plug this link into.
 * Switches declare virtual interfaces (SVIs): their ports are typed freely.
 */
function InterfacePicker({ node, peer, edge, side }: { node?: InfraNode; peer?: InfraNode; edge: InfraEdge; side: 'source' | 'target' }) {
  const edges = useDiagram((s) => s.edges);
  const nodes = useDiagram((s) => s.nodes);
  const update = useDiagram((s) => s.updateEdge);
  if (!node || isSwitching(node)) return null;
  const list = interfacesOf(node, edges).filter((i) => !subInterface(i.name));
  if (!list.length) return null;
  const current = side === 'source' ? edge.data?.sourcePort : edge.data?.targetPort;
  const name = (id: string) => nodes.find((n) => n.id === id)?.data.name ?? '?';
  const pick = (iface: string) => {
    const patch: Partial<InfraEdgeData> = side === 'source' ? { sourcePort: iface } : { targetPort: iface };
    // Towards a switch, the interface's VLANs set the switchport: one is access, several a trunk.
    if (peer && isSwitching(peer)) {
      const vlans = interfaceVlans(node, iface);
      if (vlans.length === 1) Object.assign(patch, { mode: 'access', vlan: vlans[0] });
      else if (vlans.length > 1) Object.assign(patch, { mode: 'trunk', vlan: vlans.join(',') });
    }
    update(edge.id, patch);
  };
  return (
    <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label={`Interfaces of ${node.data.name}`}>
      {list.map((i) => {
        const active = current === i.name;
        const taken = !!i.link && i.link.edgeId !== edge.id;
        return (
          <button
            key={i.name}
            type="button"
            aria-pressed={active}
            disabled={taken}
            onClick={() => pick(i.name)}
            title={taken ? `Used by the link to ${name(i.link!.peer)}${i.link!.peerPort ? ` (${i.link!.peerPort})` : ''}` : i.addresses.join(', ') || 'No address'}
            className={cn(
              'flex h-6 max-w-full items-center gap-1 rounded-md border px-1.5 font-mono text-[10.5px] transition-colors',
              active ? 'border-primary bg-primary-soft text-primary' : taken ? 'cursor-not-allowed border-line text-subtle line-through opacity-60' : 'border-line text-muted hover:border-primary hover:text-fg',
            )}
          >
            <span className="truncate">{i.name}</span>
            {i.addresses[0] && <span className="truncate text-subtle">{i.addresses[0]}</span>}
          </button>
        );
      })}
    </div>
  );
}

const SPEEDS = ['100 Mbps', '1 Gbps', '2.5 Gbps', '10 Gbps', '25 Gbps', '40 Gbps', '100 Gbps', 'Wi-Fi 6', 'Wi-Fi 7'];

export function EdgeProperties({ edge }: { edge: InfraEdge }) {
  const nodes = useDiagram((s) => s.nodes);
  const edges = useDiagram((s) => s.edges);
  const update = useDiagram((s) => s.updateEdge);
  const reverse = useDiagram((s) => s.reverseEdge);
  const remove = useDiagram((s) => s.deleteElements);
  const source = nodes.find((n) => n.id === edge.source);
  const target = nodes.find((n) => n.id === edge.target);
  const data = edge.data ?? { connType: 'ethernet' as const };
  const physical = data.connType !== 'logical' && data.connType !== 'arrow';
  const others = edges.filter((e) => e.id !== edge.id);
  const id = (k: string) => `e-${edge.id}-${k}`;

  const Endpoint = ({ name, type }: { name?: string; type?: string }) => {
    const def = type ? getDefinition(type) : undefined;
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-surface-2 px-2 py-1.5">
        {def && <Icon name={def.icon} size={14} className="shrink-0 text-muted" />}
        <span className="truncate text-[12.5px] font-medium text-fg">{name}</span>
      </div>
    );
  };

  return (
    <div>
      <div className="border-b border-line px-4 py-4">
        <div className="mb-2 text-[12px] font-medium text-muted">Connection</div>
        <div className="flex items-center gap-1.5">
          <Endpoint name={source?.data.name} type={source?.data.type} />
          <IconButton label="Reverse direction" size="sm" onClick={() => reverse(edge.id)}>
            <ArrowLeftRight size={14} />
          </IconButton>
          <Endpoint name={target?.data.name} type={target?.data.type} />
        </div>
      </div>

      <Section title="Type">
        <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Connection type">
          {CONNECTION_TYPES.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={data.connType === c.id}
              onClick={() => update(edge.id, { connType: c.id })}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-[12px] transition-colors',
                data.connType === c.id ? 'border-primary bg-primary-soft text-fg' : 'border-line text-muted hover:bg-surface-2 hover:text-fg',
              )}
            >
              <svg width="20" height="6" className="shrink-0">
                <line x1="1" y1="3" x2="19" y2="3" stroke={c.color} strokeWidth={c.width} strokeDasharray={c.dash} strokeLinecap="round" />
              </svg>
              {c.label}
            </button>
          ))}
        </div>
      </Section>

      {data.connType !== 'arrow' && data.connType !== 'logical' && (
        <>
          <ParallelLinksSection edge={edge} />
          <BondSection key={edge.id} edge={edge} />
        </>
      )}

      <Section title="Properties">
        <div className="space-y-3">
          {physical && (
            <FieldRow label="Speed" htmlFor={id('speed')}>
              <Input id={id('speed')} list={id('speeds')} value={data.speed ?? ''} placeholder="1 Gbps" onChange={(e) => update(edge.id, { speed: e.target.value })} />
              <datalist id={id('speeds')}>
                {SPEEDS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </FieldRow>
          )}
          {physical && (
            <div className="grid grid-cols-2 gap-2">
              <FieldRow label={`Port on ${source?.data.name ?? 'source'}`} htmlFor={id('sp')}>
                <Input
                  id={id('sp')}
                  mono
                  value={data.sourcePort ?? ''}
                  placeholder={source ? nextPort(source, others) || 'eth0' : ''}
                  onChange={(e) => update(edge.id, { sourcePort: e.target.value })}
                />
                <InterfacePicker node={source} peer={target} edge={edge} side="source" />
              </FieldRow>
              <FieldRow label={`Port on ${target?.data.name ?? 'target'}`} htmlFor={id('tp')}>
                <Input
                  id={id('tp')}
                  mono
                  value={data.targetPort ?? ''}
                  placeholder={target ? nextPort(target, others) || 'eth0' : ''}
                  onChange={(e) => update(edge.id, { targetPort: e.target.value })}
                />
                <InterfacePicker node={target} peer={source} edge={edge} side="target" />
              </FieldRow>
            </div>
          )}
          {data.connType !== 'arrow' && (
            <>
              <div>
                <span className="mb-1 block text-xs font-medium text-muted">Switchport mode</span>
                <Segmented
                  value={data.mode ?? ''}
                  onChange={(mode) => update(edge.id, { mode })}
                  options={[
                    { value: '', label: 'None' },
                    { value: 'access', label: 'Access' },
                    { value: 'trunk', label: 'Trunk' },
                  ]}
                />
              </div>
              <FieldRow label={data.mode === 'trunk' ? 'Allowed VLANs' : 'VLAN'} htmlFor={id('vlan')}>
                {data.mode === 'trunk' ? (
                  <VlanMultiSelect value={data.vlan ?? ''} onChange={(vlan) => update(edge.id, { vlan })} />
                ) : (
                  <VlanSelect id={id('vlan')} value={data.vlan ?? ''} onChange={(vlan) => update(edge.id, { vlan })} />
                )}
              </FieldRow>
            </>
          )}
          <FieldRow label="Label" htmlFor={id('label')}>
            <Input id={id('label')} value={data.label ?? ''} placeholder="e.g. HTTPS, LACP, uplink" onChange={(e) => update(edge.id, { label: e.target.value })} />
          </FieldRow>
          <FieldRow label="Description" htmlFor={id('desc')}>
            <Textarea id={id('desc')} rows={2} value={data.description ?? ''} onChange={(e) => update(edge.id, { description: e.target.value })} />
          </FieldRow>
        </div>
      </Section>
      <div className="flex items-center px-4 py-3">
        <span className="flex-1" />
        <Button size="sm" variant="ghost" icon={<Trash size={14} />} className="hover:!text-danger" onClick={() => remove([], [edge.id])}>
          Delete link
        </Button>
      </div>
    </div>
  );
}
