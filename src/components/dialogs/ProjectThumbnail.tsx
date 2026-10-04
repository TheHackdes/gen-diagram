import { colorOf, getDefinition, hasDefinition } from '../../data/catalog';
import type { ProjectSummary } from '../../features/projects/storage';

export function ProjectThumbnail({ preview }: { preview: ProjectSummary['preview'] }) {
  return (
    <svg viewBox="-0.05 -0.05 1.1 1.1" className="h-full w-full" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {preview.map((r, i) => {
        const def = r.c && hasDefinition(r.c) ? getDefinition(r.c) : undefined;
        const color = def ? colorOf(def) : '#94a3b8';
        const zone = def && (def.kind === 'zone' || def.kind === 'container');
        return (
          <rect
            key={i}
            x={r.x}
            y={r.y}
            width={Math.max(r.w, 0.01)}
            height={Math.max(r.h, 0.01)}
            rx={0.008}
            fill={zone ? `${color}14` : color}
            fillOpacity={zone ? 1 : 0.85}
            stroke={zone ? color : 'none'}
            strokeOpacity={0.5}
            strokeWidth={0.003}
            strokeDasharray={zone ? '0.01 0.006' : undefined}
          />
        );
      })}
    </svg>
  );
}
