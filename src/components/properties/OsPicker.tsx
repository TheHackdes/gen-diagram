import { getAllOperatingSystems, getOperatingSystem, OS_FAMILIES } from '../../data/operatingSystems';
import { useDiagram } from '../../store/diagramStore';
import { useUi } from '../../store/uiStore';
import type { OsFamily } from '../../types';
import { str } from '../../utils/misc';
import { Icon } from '../icons/Icon';
import { Label, Select } from '../ui/Field';

/** Family → distribution → version picker. */
export function OsPicker({ nodeId, osId, version }: { nodeId: string; osId: unknown; version: unknown }) {
  useDiagram((s) => s.customOs);
  const update = useDiagram((s) => s.updateNodeProps);
  const all = getAllOperatingSystems();
  const os = getOperatingSystem(osId);
  const family: OsFamily | '' = os?.family ?? '';
  const families = OS_FAMILIES.filter((f) => all.some((o) => o.family === f.id));
  const distributions = all.filter((o) => o.family === family);

  const setOs = (id: string) => {
    const next = getOperatingSystem(id);
    update(nodeId, { os: id, osVersion: next?.versions[next.versions.length - 1]?.id ?? '' });
  };

  return (
    <div className="space-y-2 rounded-xl border border-line bg-surface-2/50 p-2.5">
      <div className="flex items-center gap-2">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface"
          style={{ color: os?.color ?? 'var(--text-subtle)' }}
        >
          <Icon name={os?.icon ?? 'brand:linux'} size={16} />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[13px] font-medium text-fg">{os ? os.name : 'No operating system'}</div>
          <div className="text-[11px] text-muted">{os ? `${OS_FAMILIES.find((f) => f.id === os.family)?.label} · ${os.versions.find((v) => v.id === version)?.label ?? 'any version'}` : 'Choose a family and distribution'}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor={`osfam-${nodeId}`}>Family</Label>
          <Select
            id={`osfam-${nodeId}`}
            value={family}
            onChange={(e) => {
              const first = all.find((o) => o.family === e.target.value);
              if (first) setOs(first.id);
              else update(nodeId, { os: '', osVersion: '' });
            }}
          >
            <option value="">None</option>
            {families.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor={`osdist-${nodeId}`}>Distribution</Label>
          <Select id={`osdist-${nodeId}`} value={os?.id ?? ''} disabled={!family} onChange={(e) => setOs(e.target.value)}>
            {!family && <option value="">—</option>}
            {distributions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
      {os && (
        <div>
          <Label htmlFor={`osver-${nodeId}`}>Version</Label>
          <Select id={`osver-${nodeId}`} value={str(version)} onChange={(e) => update(nodeId, { osVersion: e.target.value })}>
            <option value="">Unspecified</option>
            {os.versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
                {v.lts && !v.label.includes('LTS') ? ' (LTS)' : ''}
              </option>
            ))}
          </Select>
        </div>
      )}
      <button type="button" onClick={() => useUi.getState().openDialog('customOs')} className="text-[11.5px] text-primary hover:underline">
        Missing an OS? Add a custom one
      </button>
    </div>
  );
}
