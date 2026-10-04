import { ArrowLeftRight, Trash } from 'lucide-react';
import { getDefinition } from '../../data/catalog';
import { CONNECTION_TYPES, nextPort } from '../../features/connections/suggest';
import { useDiagram } from '../../store/diagramStore';
import type { InfraEdge } from '../../types';
import { Icon } from '../icons/Icon';
import { Button, IconButton } from '../ui/Button';
import { cn } from '../ui/cn';
import { FieldRow, Input, Segmented, Textarea } from '../ui/Field';
import { VlanMultiSelect, VlanSelect } from './FieldEditor';
import { Section } from './NodeProperties';

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
        <div className="mb-2 text-[11px] font-semibold tracking-wider text-primary uppercase">Connection</div>
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
              </FieldRow>
              <FieldRow label={`Port on ${target?.data.name ?? 'target'}`} htmlFor={id('tp')}>
                <Input
                  id={id('tp')}
                  mono
                  value={data.targetPort ?? ''}
                  placeholder={target ? nextPort(target, others) || 'eth0' : ''}
                  onChange={(e) => update(edge.id, { targetPort: e.target.value })}
                />
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
