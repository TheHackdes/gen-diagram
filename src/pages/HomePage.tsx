import { ArrowRight, FileBraces, Layers, Moon, Network, Plus, ShieldCheck, Sun, Trash, Upload, Wand2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { confirmDeleteProject, openProject } from '../components/dialogs/OpenProjectDialog';
import { ProjectThumbnail } from '../components/dialogs/ProjectThumbnail';
import { startFromTemplate, TemplateGrid } from '../components/dialogs/TemplatesDialog';
import { Button, IconButton } from '../components/ui/Button';
import { Logo } from '../components/ui/Logo';
import { TEMPLATES } from '../data/templates';
import { projectActions } from '../features/projects/actions';
import { listProjects, type ProjectSummary } from '../features/projects/storage';
import { useUi } from '../store/uiStore';

const FEATURES = [
  { icon: <Network size={16} />, title: 'Built for infrastructure', text: 'Switches, firewalls, hypervisors, VMs, LXC, Docker, 15+ operating systems.' },
  { icon: <Layers size={16} />, title: 'VLANs & subnets', text: 'Visual zones, trunk/access links, ports and IP plans that stay consistent.' },
  { icon: <ShieldCheck size={16} />, title: 'Built-in validation', text: 'Duplicate IPs, out-of-subnet hosts, reused ports and isolated devices.' },
  { icon: <Wand2 size={16} />, title: 'Auto layout & export', text: 'Five layout algorithms, PNG up to 4K, SVG and PDF for your documentation.' },
];

function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

export function HomePage() {
  const theme = useUi((s) => s.theme);
  const toggleTheme = useUi((s) => s.toggleTheme);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const refresh = () => setProjects(listProjects());
  useEffect(refresh, []);

  return (
    <div className="h-full overflow-y-auto bg-bg">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Logo />
          <span className="flex-1" />
          <Button variant="ghost" size="sm" icon={<Upload size={14} />} onClick={projectActions.importJson}>
            <span className="hidden sm:inline">Import</span>
          </Button>
          <IconButton label={theme === 'dark' ? 'Light theme' : 'Dark theme'} onClick={toggleTheme}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </IconButton>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <section className="py-10 sm:py-14">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[11.5px] font-medium text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-success" /> Network & infrastructure diagrams
            </span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-fg sm:text-4xl">
              Design infrastructure diagrams your team will actually read.
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">
              Drag equipment, nest VMs and containers in their hosts, draw VLANs and links — InfraCanvas understands how an IT
              infrastructure fits together and keeps your documentation consistent.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button variant="primary" size="md" icon={<Plus size={16} />} onClick={() => startFromTemplate(TEMPLATES.find((t) => t.id === 'blank')!)}>
                New diagram
              </Button>
              <Button size="md" icon={<ArrowRight size={16} />} onClick={() => startFromTemplate(TEMPLATES[0])}>
                Explore the demo
              </Button>
            </div>
          </div>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border border-line bg-surface p-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">{f.icon}</span>
                <h3 className="mt-3 text-[13.5px] font-semibold text-fg">{f.title}</h3>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="py-6">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="text-lg font-semibold text-fg">Your projects</h2>
              <p className="text-[12.5px] text-muted">Stored locally in this browser · export to JSON to share or back up.</p>
            </div>
          </div>
          {projects.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line-strong px-6 py-10 text-center">
              <FileBraces size={22} className="mx-auto text-subtle" />
              <p className="mt-2 text-[13px] text-muted">No project yet — start from a template below.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {projects.map((p) => (
                <div key={p.id} className="group relative overflow-hidden rounded-xl border border-line bg-surface transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-lg hover:shadow-primary/5">
                  <button type="button" onClick={() => openProject(p.id)} className="block w-full text-left">
                    <div className="h-32 border-b border-line bg-canvas p-3">
                      {p.preview.length ? <ProjectThumbnail preview={p.preview} /> : <div className="flex h-full items-center justify-center text-[12px] text-subtle">Empty</div>}
                    </div>
                    <div className="p-3">
                      <div className="truncate text-[13.5px] font-semibold text-fg group-hover:text-primary">{p.name}</div>
                      <div className="mt-0.5 text-[11.5px] text-muted">
                        {p.nodeCount} elements · edited {timeAgo(p.updatedAt)}
                      </div>
                    </div>
                  </button>
                  <IconButton
                    label="Delete project"
                    size="sm"
                    className="absolute top-2 right-2 bg-surface/90 opacity-0 shadow-sm group-hover:opacity-100 focus:opacity-100"
                    onClick={() => confirmDeleteProject(p, refresh)}
                  >
                    <Trash size={13} />
                  </IconButton>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="py-6">
          <h2 className="text-lg font-semibold text-fg">Start from a template</h2>
          <p className="mb-3 text-[12.5px] text-muted">Every template is fully editable and laid out automatically.</p>
          <TemplateGrid onPick={startFromTemplate} />
        </section>
      </main>
    </div>
  );
}
