import {
  ChevronDown,
  Copy,
  Download,
  FileBraces,
  FilePlus,
  FolderOpen,
  House,
  Keyboard,
  LayoutTemplate,
  Moon,
  PanelLeft,
  PanelRight,
  Presentation,
  Redo2,
  Save,
  Sun,
  Undo2,
  Upload,
  Wand2,
  History,
  FileText,
} from 'lucide-react';
import { LAYOUT_ALGORITHMS } from '../../features/layout/autoLayout';
import { projectActions } from '../../features/projects/actions';
import { ViewMenu } from './ViewMenu';
import { useDiagram } from '../../store/diagramStore';
import { useUi } from '../../store/uiStore';
import { modKey } from '../../utils/misc';
import { Button, IconButton } from '../ui/Button';
import { LogoMark } from '../ui/Logo';
import { Dropdown, type MenuEntry } from '../ui/Menu';

function ProjectName() {
  const name = useDiagram((s) => s.metadata.name);
  const rename = useDiagram((s) => s.renameProject);
  return (
    <input
      aria-label="Project name"
      value={name}
      onChange={(e) => rename(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className="h-8 w-[clamp(96px,16vw,260px)] truncate rounded-lg border border-transparent bg-transparent px-2 text-[13.5px] font-semibold text-fg outline-none hover:border-line focus:border-primary focus:bg-surface"
    />
  );
}

export function TopBar() {
  const ui = useUi();
  const canUndo = useDiagram((s) => s.past.length > 0);
  const canRedo = useDiagram((s) => s.future.length > 0);
  const undo = useDiagram((s) => s.undo);
  const redo = useDiagram((s) => s.redo);
  const applyLayout = useDiagram((s) => s.applyLayout);

  const fileMenu: MenuEntry[] = [
    { id: 'new', label: 'New project…', icon: <FilePlus size={14} />, onSelect: () => ui.openDialog('templates') },
    { id: 'open', label: 'Open project…', icon: <FolderOpen size={14} />, shortcut: `${modKey}O`, onSelect: () => ui.openDialog('open') },
    'separator',
    { id: 'save', label: 'Save', icon: <Save size={14} />, shortcut: `${modKey}S`, onSelect: projectActions.save },
    { id: 'saveas', label: 'Save as…', icon: <Save size={14} />, shortcut: `${modKey}⇧S`, onSelect: projectActions.saveAs },
    { id: 'dup', label: 'Duplicate project', icon: <Copy size={14} />, onSelect: projectActions.duplicate },
    { id: 'history', label: 'Version history…', icon: <History size={14} />, onSelect: () => ui.openDialog('history') },
    'separator',
    { id: 'import', label: 'Import JSON…', icon: <Upload size={14} />, onSelect: projectActions.importJson },
    { id: 'exportjson', label: 'Export JSON', icon: <FileBraces size={14} />, onSelect: projectActions.exportJson },
    { id: 'export', label: 'Export image…', icon: <Download size={14} />, shortcut: `${modKey}E`, onSelect: () => ui.openDialog('export') },
    { id: 'docs', label: 'Export documentation…', icon: <FileText size={14} />, onSelect: () => ui.openDialog('docs') },
    'separator',
    { id: 'home', label: 'All projects', icon: <House size={14} />, onSelect: () => projectActions.guardUnsaved(() => ui.setView('home')) },
  ];

  const layoutMenu: MenuEntry[] = [
    { heading: 'Auto layout' },
    ...LAYOUT_ALGORITHMS.map((a) => ({
      id: a.id,
      label: a.label,
      description: a.description,
      onSelect: () => applyLayout(a.id),
    })),
  ];

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 overflow-hidden border-b border-line bg-surface px-2">
      <button type="button" onClick={() => projectActions.guardUnsaved(() => ui.setView('home'))} className="flex items-center rounded-lg p-1 hover:bg-surface-2" aria-label="All projects">
        <LogoMark size={26} />
      </button>
      <Dropdown
        items={fileMenu}
        trigger={({ toggle, open }) => (
          <Button variant="ghost" size="sm" onClick={toggle} className={open ? 'bg-surface-2 text-fg' : ''}>
            File <ChevronDown size={13} />
          </Button>
        )}
      />
      <ProjectName />
      <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
      <IconButton label="Undo" shortcut={`${modKey}Z`} disabled={!canUndo} onClick={undo}>
        <Undo2 size={16} />
      </IconButton>
      <IconButton label="Redo" shortcut={`${modKey}⇧Z`} disabled={!canRedo} onClick={redo}>
        <Redo2 size={16} />
      </IconButton>
      <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
      <Dropdown
        items={layoutMenu}
        trigger={({ toggle, open }) => (
          <Button variant="ghost" size="sm" onClick={toggle} icon={<Wand2 size={15} />} className={open ? 'bg-surface-2 text-fg' : ''}>
            <span className="hidden md:inline">Auto layout</span>
            <ChevronDown size={13} />
          </Button>
        )}
      />
      <ViewMenu />
      <Button variant="ghost" size="sm" icon={<LayoutTemplate size={15} />} onClick={() => ui.openDialog('templates')} className="hidden lg:inline-flex">
        Templates
      </Button>

      <span className="flex-1" />

      <IconButton label="Keyboard shortcuts" shortcut="?" onClick={() => ui.openDialog('shortcuts')} className="hidden lg:inline-flex">
        <Keyboard size={16} />
      </IconButton>
      <IconButton label={ui.theme === 'dark' ? 'Light theme' : 'Dark theme'} onClick={ui.toggleTheme}>
        {ui.theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </IconButton>
      <IconButton label="Toggle library" active={ui.leftOpen} onClick={() => ui.setLeftOpen(!ui.leftOpen)}>
        <PanelLeft size={16} />
      </IconButton>
      <IconButton label="Toggle properties" active={ui.rightOpen} onClick={() => ui.setRightOpen(!ui.rightOpen)}>
        <PanelRight size={16} />
      </IconButton>
      <span className="mx-1 h-5 w-px bg-line" />
      <Button variant="secondary" size="sm" icon={<Presentation size={15} />} onClick={() => ui.setPresentation(true)}>
        <span className="hidden md:inline">Present</span>
      </Button>
      <Button variant="primary" size="sm" icon={<Download size={15} />} onClick={() => ui.openDialog('export')}>
        <span className="hidden sm:inline">Export</span>
      </Button>
    </header>
  );
}
