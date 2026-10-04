import { useUi } from '../../store/uiStore';
import { modKey } from '../../utils/misc';
import { Dialog } from '../ui/Dialog';
import { Kbd } from '../ui/Kbd';

const GROUPS: { title: string; items: [string[], string][] }[] = [
  {
    title: 'Edit',
    items: [
      [[modKey, 'Z'], 'Undo'],
      [[modKey, '⇧', 'Z'], 'Redo'],
      [[modKey, 'C'], 'Copy'],
      [[modKey, 'X'], 'Cut'],
      [[modKey, 'V'], 'Paste'],
      [[modKey, 'D'], 'Duplicate'],
      [['Del'], 'Delete selection'],
      [[modKey, 'A'], 'Select all'],
      [['Esc'], 'Clear selection'],
    ],
  },
  {
    title: 'Arrange',
    items: [
      [[modKey, 'G'], 'Group'],
      [[modKey, '⇧', 'G'], 'Ungroup'],
      [[modKey, 'L'], 'Lock / unlock'],
      [['←↑→↓'], 'Nudge (⇧ = 10×)'],
      [['⇧', 'L'], 'Auto layout'],
    ],
  },
  {
    title: 'View',
    items: [
      [['Space', 'drag'], 'Pan'],
      [['Middle', 'drag'], 'Pan'],
      [['Wheel'], 'Zoom'],
      [['+', '/', '-'], 'Zoom in / out'],
      [['⇧', '1'], 'Fit to screen'],
      [['P'], 'Presentation mode'],
    ],
  },
  {
    title: 'Project',
    items: [
      [[modKey, 'S'], 'Save'],
      [[modKey, '⇧', 'S'], 'Save as'],
      [[modKey, 'O'], 'Open'],
      [[modKey, 'E'], 'Export image'],
      [[modKey, 'K'], 'Search components'],
      [['?'], 'This help'],
    ],
  },
];

export function ShortcutsDialog() {
  const open = useUi((s) => s.dialog === 'shortcuts');
  return (
    <Dialog open={open} onClose={() => useUi.getState().openDialog(null)} title="Keyboard shortcuts" size="lg">
      <div className="grid gap-6 sm:grid-cols-2">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <h4 className="mb-2 text-[11px] font-semibold tracking-wider text-subtle uppercase">{g.title}</h4>
            <ul className="space-y-1.5">
              {g.items.map(([keys, label]) => (
                <li key={label + keys.join()} className="flex items-center justify-between text-[13px] text-fg">
                  <span>{label}</span>
                  <span className="flex gap-1">
                    {keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
