import { ChevronDown, CopyPlus, Lock, LockOpen, LogOut, Plus, RotateCcw, Trash } from 'lucide-react';
import { useState } from 'react';
import { CATEGORY_BY_ID } from '../../data/categories';
import { colorOf, getDefinition, getPreset } from '../../data/catalog';
import { CONNECTION_STYLE } from '../../features/connections/suggest';
import { useDiagram } from '../../store/diagramStore';
import type { InfraNode } from '../../types';
import { alpha, str } from '../../utils/misc';
import { Icon } from '../icons/Icon';
import { Button, IconButton } from '../ui/Button';
import { cn } from '../ui/cn';
import { FieldRow, Input } from '../ui/Field';
import { FieldEditor } from './FieldEditor';

const ACCENTS = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2', '#db2777', '#475569'];

export function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-3.5">
      <div className="mb-2.5 flex items-center justify-between">
        <h4 className="text-[11px] font-semibold tracking-wider text-subtle uppercase">{title}</h4>
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

function Connections({ node }: { node: InfraNode }) {
  const edges = useDiagram((s) => s.edges);
  const nodes = useDiagram((s) => s.nodes);
  const select = useDiagram((s) => s.select);
  const mine = edges.filter((e) => e.source === node.id || e.target === node.id);
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
  const basic = def.fields.filter((f) => !f.advanced);
  const extra = def.fields.filter((f) => f.advanced);
  const filledAdvanced = extra.filter((f) => str(node.data.props[f.key])).length;
  const named = def.kind !== 'annotation';

  return (
    <div>
      <div className="flex items-start gap-3 border-b border-line px-4 py-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: alpha(color, 0.12), color }}>
          <Icon name={def.icon} size={20} brandColor={def.icon.startsWith('brand:')} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold tracking-wider uppercase" style={{ color }}>
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
