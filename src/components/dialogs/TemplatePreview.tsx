import { colorOf, getDefinition } from '../../data/catalog';
import type { TemplateResult } from '../../data/templates';
import { absolutePosition, indexById, nodeSize } from '../../features/nodes/hierarchy';

/** Miniature rendering of a template (boxes + links). */
export function TemplatePreview({ content }: { content: TemplateResult }) {
  const byId = indexById(content.nodes);
  const boxes = content.nodes
    .filter((n) => getDefinition(n.data.type).kind !== 'annotation' || n.data.type === 'area')
    .map((n) => ({ n, p: absolutePosition(n, byId), s: nodeSize(n), def: getDefinition(n.data.type) }));
  if (!boxes.length) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border-2 border-dashed border-line-strong text-[12px] text-subtle">
        Empty canvas
      </div>
    );
  }
  const minX = Math.min(...boxes.map((b) => b.p.x));
  const minY = Math.min(...boxes.map((b) => b.p.y));
  const maxX = Math.max(...boxes.map((b) => b.p.x + b.s.width));
  const maxY = Math.max(...boxes.map((b) => b.p.y + b.s.height));
  const center = new Map(boxes.map((b) => [b.n.id, { x: b.p.x + b.s.width / 2, y: b.p.y + b.s.height / 2 }]));
  return (
    <svg viewBox={`${minX - 20} ${minY - 20} ${maxX - minX + 40} ${maxY - minY + 40}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {content.edges.map((e) => {
        const a = center.get(e.source);
        const b = center.get(e.target);
        if (!a || !b) return null;
        return <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#94a3b8" strokeWidth={4} strokeOpacity={0.6} />;
      })}
      {boxes.map(({ n, p, s, def }) => {
        const color = colorOf(def);
        const area = def.kind === 'zone' || def.kind === 'container';
        return (
          <rect
            key={n.id}
            x={p.x}
            y={p.y}
            width={s.width}
            height={s.height}
            rx={area ? 18 : 10}
            fill={area ? `${color}10` : 'var(--node-bg)'}
            stroke={color}
            strokeOpacity={area ? 0.5 : 0.9}
            strokeWidth={area ? 4 : 5}
            strokeDasharray={def.kind === 'zone' ? '14 8' : undefined}
          />
        );
      })}
    </svg>
  );
}
