import type { NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { CONNECTION_STYLE } from '../../../features/connections/suggest';
import { useDiagram } from '../../../store/diagramStore';
import type { ConnectionType, InfraNode } from '../../../types';
import { str } from '../../../utils/misc';
import { cn } from '../../ui/cn';
import { CapabilityBadges, EditableName, NodeHandles, Resizer } from './shared';

const frame = (selected?: boolean) =>
  cn('selection-ring relative h-full w-full rounded-lg', selected && 'outline-2 outline-offset-2 outline-primary/60 outline-dashed');

export const TitleNode = memo(function TitleNode({ id, data, selected }: NodeProps<InfraNode>) {
  return (
    <div className={frame(selected)}>
      <Resizer id={id} selected={selected} minWidth={120} minHeight={32} locked={data.locked} />
      <EditableName id={id} field="text" value={str(data.props.text)} placeholder="Title" className="block text-[28px] leading-tight font-bold tracking-tight whitespace-nowrap text-fg" />
      {str(data.props.subtitle) && <div className="mt-1 text-[15px] whitespace-nowrap text-muted">{str(data.props.subtitle)}</div>}
    </div>
  );
});

const TEXT_SIZES: Record<string, string> = { small: 'text-[12px]', medium: 'text-[14px]', large: 'text-[18px]' };

export const TextNode = memo(function TextNode({ id, data, selected }: NodeProps<InfraNode>) {
  return (
    <div className={frame(selected)}>
      <Resizer id={id} selected={selected} minWidth={40} minHeight={20} locked={data.locked} />
      <NodeHandles nodeId={id} />
      <EditableName
        id={id}
        field="text"
        multiline
        value={str(data.props.text)}
        placeholder="Text"
        className={cn(
          'block px-1 whitespace-pre-wrap text-fg',
          TEXT_SIZES[str(data.props.size)] ?? TEXT_SIZES.medium,
          str(data.props.weight) === 'bold' && 'font-semibold',
        )}
      />
    </div>
  );
});

const NOTE_TONES: Record<string, { bg: string; border: string; text: string }> = {
  yellow: { bg: '#fef9c3', border: '#fde047', text: '#713f12' },
  blue: { bg: '#dbeafe', border: '#93c5fd', text: '#1e3a8a' },
  green: { bg: '#dcfce7', border: '#86efac', text: '#14532d' },
  red: { bg: '#fee2e2', border: '#fca5a5', text: '#7f1d1d' },
  gray: { bg: '#f1f5f9', border: '#cbd5e1', text: '#1e293b' },
};

export const NoteNode = memo(function NoteNode({ id, data, selected }: NodeProps<InfraNode>) {
  const tone = NOTE_TONES[str(data.props.tone)] ?? NOTE_TONES.yellow;
  return (
    <div
      className={cn('selection-ring relative h-full w-full rounded-md border p-3 shadow-sm', selected && 'ring-2 ring-primary/40')}
      style={{ background: tone.bg, borderColor: tone.border, color: tone.text }}
    >
      <Resizer id={id} selected={selected} minWidth={100} minHeight={60} locked={data.locked} />
      <NodeHandles nodeId={id} />
      <EditableName id={id} field="text" multiline value={str(data.props.text)} placeholder="Note" className="block text-[13px] leading-snug whitespace-pre-wrap" />
    </div>
  );
});

export const LegendNode = memo(function LegendNode({ id, data, selected }: NodeProps<InfraNode>) {
  const vlans = useDiagram((s) => s.vlans);
  const usedTypes = useDiagram((s) => {
    const set = new Set<ConnectionType>();
    for (const e of s.edges) set.add(e.data?.connType ?? 'ethernet');
    return [...set].sort().join(',');
  });
  const types = usedTypes ? (usedTypes.split(',') as ConnectionType[]) : [];
  const caps = useDiagram((s) => `${s.nodes.some((n) => n.data.props.vpn === true) ? 'v' : ''}${s.nodes.some((n) => n.data.props.fw === true) ? 'f' : ''}`);
  const showVlans = data.props.showVlans !== false && vlans.length > 0;
  const showLinks = data.props.showLinks !== false && types.length > 0;
  return (
    <div
      className={cn('selection-ring relative h-full w-full rounded-xl border border-node-line bg-node p-3', selected && 'ring-2 ring-primary/30')}
      style={{ boxShadow: 'var(--node-shadow)' }}
    >
      <Resizer id={id} selected={selected} minWidth={160} minHeight={60} locked={data.locked} />
      <div className="mb-2 text-[11px] font-bold tracking-wider text-muted uppercase">{str(data.props.text) || 'Legend'}</div>
      {showVlans && (
        <ul className="space-y-1.5">
          {vlans.map((v) => (
            <li key={v.uid} className="flex items-center gap-2 text-[11.5px] whitespace-nowrap">
              <span className="h-3 w-3 shrink-0 rounded-[3px] border-[1.5px] border-dashed" style={{ borderColor: v.color, background: `${v.color}22` }} />
              <span className="font-semibold text-fg">VLAN {v.id}</span>
              <span className="truncate text-muted">{v.name}</span>
              {v.subnet && <span className="ml-auto pl-2 font-mono text-[10px] text-subtle">{v.subnet}</span>}
            </li>
          ))}
        </ul>
      )}
      {showVlans && showLinks && <div className="my-2 h-px bg-line" />}
      {showLinks && (
        <ul className="space-y-1.5">
          {types.map((t) => {
            const st = CONNECTION_STYLE[t];
            return (
              <li key={t} className="flex items-center gap-2 text-[11.5px] text-fg">
                <svg width="28" height="8" className="shrink-0">
                  <line x1="0" y1="4" x2="28" y2="4" stroke={st.color} strokeWidth={st.width} strokeDasharray={st.dash} strokeLinecap="round" />
                </svg>
                {st.label}
              </li>
            );
          })}
        </ul>
      )}
      {data.props.showLinks !== false && caps && (
        <>
          {(showVlans || showLinks) && <div className="my-2 h-px bg-line" />}
          <ul className="space-y-1.5 text-[11.5px] text-fg">
            {caps.includes('v') && (
              <li className="flex items-center gap-2">
                <span className="w-7"><CapabilityBadges props={{ vpn: true }} /></span>
                Integrated VPN gateway
              </li>
            )}
            {caps.includes('f') && (
              <li className="flex items-center gap-2">
                <span className="w-7"><CapabilityBadges props={{ fw: true }} /></span>
                Host firewall
              </li>
            )}
          </ul>
        </>
      )}
      {!showVlans && !showLinks && <p className="text-[11px] text-subtle">Add VLANs or links to populate the legend.</p>}
    </div>
  );
});

export const SeparatorNode = memo(function SeparatorNode({ id, data, selected }: NodeProps<InfraNode>) {
  const vertical = str(data.props.orientation) === 'vertical';
  const text = str(data.props.text);
  return (
    <div className={cn(frame(selected), 'flex items-center justify-center', vertical && 'flex-col')}>
      <Resizer id={id} selected={selected} minWidth={vertical ? 12 : 60} minHeight={vertical ? 60 : 12} locked={data.locked} />
      <div className={cn('bg-line-strong', vertical ? 'w-px flex-1' : 'h-px flex-1')} />
      {text && <span className={cn('text-[11px] font-semibold tracking-wider text-muted uppercase', vertical ? 'py-2 [writing-mode:vertical-rl]' : 'px-3')}>{text}</span>}
      <div className={cn('bg-line-strong', vertical ? 'w-px flex-1' : 'h-px flex-1')} />
    </div>
  );
});

const ARROW_COORDS: Record<string, [string, string, string, string]> = {
  right: ['2%', '50%', '97%', '50%'],
  left: ['98%', '50%', '3%', '50%'],
  down: ['50%', '2%', '50%', '97%'],
  up: ['50%', '98%', '50%', '3%'],
};

export const ArrowNode = memo(function ArrowNode({ id, data, selected }: NodeProps<InfraNode>) {
  const dir = str(data.props.direction) || 'right';
  const [x1, y1, x2, y2] = ARROW_COORDS[dir] ?? ARROW_COORDS.right;
  const text = str(data.props.text);
  const marker = `arrow-head-${id}`;
  return (
    <div className={cn(frame(selected), 'flex items-center justify-center text-muted')}>
      <Resizer id={id} selected={selected} minWidth={24} minHeight={24} locked={data.locked} />
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        <defs>
          <marker id={marker} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M1 1 L9 5 L1 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </marker>
        </defs>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth="2" strokeLinecap="round" markerEnd={`url(#${marker})`} />
      </svg>
      {text && <span className="relative rounded bg-canvas px-1.5 text-[11px] font-medium text-muted">{text}</span>}
    </div>
  );
});
