# InfraCanvas

A web app for building professional network and infrastructure diagrams: equipment, servers, hypervisors, VMs, LXC, Docker, operating systems, VLANs, subnets and links. Export to PNG (up to 4K), SVG, PDF or JSON.

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check (strict) + production build in dist/
```

On first launch a complete demo project ("Acme HQ") is created and opened.

## Highlights

- **Multiple IP addresses**: every addressable node has a main IP plus a list of additional addresses (interface label + VLAN), shown on the card, included in validation (format, subnet, duplicates) and IP suggestions.
- **Integrated services**: routers (and firewalls) can enable an *integrated VPN gateway* (protocol, mode, endpoint, tunnel network); servers, VMs, LXC, hypervisors, Docker hosts and workstations can enable a *host firewall* (nftables, ufw, firewalld, Windows Defender Firewall, pf…). Cards show `VPN` / `FW` badges, links between two VPN-capable devices are detected as tunnels (`wg0`, `ipsec0`, `tun0`), and validation flags tunnels to devices without VPN and DMZ hosts without a host firewall. Capabilities are declared per role in `src/data/catalog/index.ts` and can be overridden per definition (`capabilities`).

## Stack

React 19 · TypeScript (strict) · Vite · Tailwind CSS v4 · React Flow (`@xyflow/react`) · Zustand · dagre + d3-force (auto layout) · html-to-image + jsPDF (export) · Lucide + Simple Icons (icons).

## Architecture

```
src/
├── components/
│   ├── canvas/        Canvas, node renderers (device, container, zone, annotations), network edge, context menu
│   ├── sidebar/       Component library + search, VLAN manager, layers outline
│   ├── properties/    Dynamic properties panel, OS picker, link editor, validation issues
│   ├── toolbar/       Top bar, status bar
│   ├── dialogs/       Export, open project, templates, shortcuts, custom OS, confirm/prompt/toasts
│   ├── icons/         Icon registry (Lucide + brand marks)
│   └── ui/            Buttons, menus, dialogs, form fields, tooltips
├── data/
│   ├── catalog/       Component definitions, one file per category (fields, defaults, roles, accepted children)
│   ├── operatingSystems/  OS registry (windows.ts, linux.ts, other.ts)
│   └── templates/     Template DSL + templates (demo, small office, Proxmox, 3-tier, enterprise)
├── features/
│   ├── canvas/        Alignment guides, React Flow instance access
│   ├── connections/   Link types + smart suggestions (type, ports, speed, VLAN, access/trunk)
│   ├── layout/        Auto-layout (network, hierarchical, tree, force, grid; nested containers)
│   ├── nodes/         Factory, hierarchy (nesting/reparenting), clipboard/group/align operations
│   ├── projects/      JSON format, local storage, project commands
│   ├── validation/    Consistency rules (IPs, subnets, VLANs, ports, isolated equipment)
│   └── export/        PNG / SVG / PDF rendering
├── hooks/             Keyboard shortcuts, autosave, presentation mode
├── store/             diagramStore (document + undo/redo), uiStore (panels, dialogs, theme)
├── pages/             Home (projects + templates), Workspace
└── types/
```

### Extending

- **New component**: add a `ComponentDefinition` to a file in `src/data/catalog/` and register it in `catalog/index.ts`. The library, search, properties panel, validation and layout all read from the definition.
- **New operating system**: add an entry to `src/data/operatingSystems/*.ts`. It automatically gets library entries ("X", "X Server", "X VM", "X LXC"). Users can also add custom OSes from the UI; these are saved in the project file.
- **New template**: write a function using `TemplateBuilder` in `src/data/templates/index.ts` (no coordinates needed; auto-layout places everything).

## Project file format

`File → Export JSON` produces `{ format: "infracanvas", version: 1, metadata, nodes, networks, groups, annotations, connections, vlans, customOperatingSystems, settings, viewport }`. Import restores a diagram completely.

## Known limitations

- Projects are stored in the browser's localStorage. Use JSON export for backups and sharing; there is no server or multi-user editing.
- SVG export embeds HTML text (`foreignObject`). It renders in browsers and most documentation tools, but some desktop vector editors (e.g. Inkscape) don't display it. Use PDF for those.
- PDF export is a high-resolution raster image inside a PDF page, not vector content.
- Auto-layout is a solid starting point; dense meshes may still need manual touch-ups.
- Mobile works for viewing; editing is designed for desktop, laptop and tablet.
