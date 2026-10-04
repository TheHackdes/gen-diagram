import { Trash } from 'lucide-react';
import { useState } from 'react';
import { getOperatingSystem, OS_FAMILIES } from '../../data/operatingSystems';
import { useDiagram } from '../../store/diagramStore';
import { useUi } from '../../store/uiStore';
import type { OsFamily } from '../../types';
import { slugify } from '../../utils/misc';
import { Icon } from '../icons/Icon';
import { Button, IconButton } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { FieldRow, Input, Select } from '../ui/Field';

const ICONS = ['brand:linux', 'brand:windows', 'brand:freebsd', 'brand:apple', 'server', 'device'];

export function CustomOsDialog() {
  const open = useUi((s) => s.dialog === 'customOs');
  const customOs = useDiagram((s) => s.customOs);
  const add = useDiagram((s) => s.addCustomOs);
  const remove = useDiagram((s) => s.removeCustomOs);
  const [name, setName] = useState('');
  const [family, setFamily] = useState<OsFamily>('linux');
  const [versions, setVersions] = useState('');
  const [color, setColor] = useState('#0d9488');
  const [icon, setIcon] = useState('brand:linux');
  const close = () => useUi.getState().openDialog(null);
  const id = `custom-${slugify(name)}`;
  const exists = !!name && !!getOperatingSystem(id) && !customOs.some((o) => o.id === id);

  const submit = () => {
    if (!name.trim() || exists) return;
    const list = versions
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
      .map((v) => ({ id: v, label: v }));
    add({
      id,
      family,
      name: name.trim(),
      short: name.trim().split(' ')[0],
      icon,
      color,
      versions: list,
      usage: 'both',
      custom: true,
    });
    useUi.getState().toast(`${name.trim()} added to the library`, 'success');
    setName('');
    setVersions('');
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Custom operating systems"
      description="Add distributions that are not built in. They are saved with the project."
      size="md"
      footer={
        <>
          <Button onClick={close}>Close</Button>
          <Button variant="primary" onClick={submit} disabled={!name.trim() || exists}>
            Add operating system
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <FieldRow label="Name" htmlFor="cos-name" error={exists ? 'Already exists' : null}>
            <Input id="cos-name" value={name} placeholder="Kali Linux" onChange={(e) => setName(e.target.value)} />
          </FieldRow>
          <FieldRow label="Family" htmlFor="cos-fam">
            <Select id="cos-fam" value={family} onChange={(e) => setFamily(e.target.value as OsFamily)}>
              {OS_FAMILIES.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </Select>
          </FieldRow>
        </div>
        <FieldRow label="Versions (comma separated)" htmlFor="cos-ver">
          <Input id="cos-ver" value={versions} placeholder="2025.3, 2025.4" onChange={(e) => setVersions(e.target.value)} />
        </FieldRow>
        <div className="flex items-end gap-4">
          <div>
            <span className="mb-1 block text-xs font-medium text-muted">Icon</span>
            <div className="flex gap-1">
              {ICONS.map((i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={i}
                  onClick={() => setIcon(i)}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg border ${icon === i ? 'border-primary bg-primary-soft' : 'border-line'}`}
                  style={{ color }}
                >
                  <Icon name={i} size={15} />
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="mb-1 block text-xs font-medium text-muted">Color</span>
            <input type="color" aria-label="Color" value={color} onChange={(e) => setColor(e.target.value)} className="h-8 w-12 cursor-pointer rounded border border-line bg-transparent" />
          </div>
        </div>
        {customOs.length > 0 && (
          <div className="border-t border-line pt-3">
            <h4 className="mb-2 text-[11px] font-semibold tracking-wider text-subtle uppercase">In this project</h4>
            <ul className="space-y-1">
              {customOs.map((o) => (
                <li key={o.id} className="flex items-center gap-2 text-[13px]">
                  <span style={{ color: o.color }}>
                    <Icon name={o.icon} size={14} />
                  </span>
                  <span className="flex-1 text-fg">{o.name}</span>
                  <span className="text-[11.5px] text-muted">{o.versions.map((v) => v.label).join(', ')}</span>
                  <IconButton size="sm" label="Remove" onClick={() => remove(o.id)}>
                    <Trash size={13} />
                  </IconButton>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Dialog>
  );
}
