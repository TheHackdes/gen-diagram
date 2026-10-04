# InfraCanvas

A web app for building professional network and infrastructure diagrams: equipment, servers, hypervisors, VMs, LXC, Docker, operating systems, VLANs, subnets and links. Export to PNG (up to 4K), SVG, PDF or JSON.

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check (strict) + production build in dist/
npm test           # unit tests of the business rules (Vitest)
```

On first launch a complete demo project ("Acme HQ") is created and opened.

## Highlights

- **Multiple IP addresses**: every addressable node has a main IP plus a list of additional addresses (interface label + VLAN), shown on the card, included in validation (format, subnet, duplicates) and IP suggestions.
- **Integrated services**: routers (and firewalls) can enable an *integrated VPN gateway* (protocol, mode, endpoint, tunnel network); servers, VMs, LXC, hypervisors, Docker hosts and workstations can enable a *host firewall* (nftables, ufw, firewalld, Windows Defender Firewall, pf…). Cards show `VPN` / `FW` badges, links between two VPN-capable devices are detected as tunnels (`wg0`, `ipsec0`, `tun0`), and validation flags tunnels to devices without VPN and DMZ hosts without a host firewall. Capabilities are declared per role in `src/data/catalog/index.ts` and can be overridden per definition (`capabilities`).

- **Integrated Wi-Fi**: routers and firewalls can also be access points (SSID, band, standard, security); links to laptops/phones become Wi-Fi links.
- **Choose what is displayed**: each additional IP has a show/hide toggle; VPN details (tunnel IP, protocol, mode, public endpoint, tunnel network) and Wi-Fi details (SSID, band…) can be individually displayed on the card.
- **Multiple roles**: any addressable equipment can also act as DHCP, DNS, NAT, NTP, proxy, directory, file server, backup, monitoring… (`src/data/services.ts`). Shown as badges on cards and in the legend; validation flags several DHCP servers on one VLAN.
- **Structured firewall rules**: each rule reads as a sentence in the properties panel and opens into a full-width editor (address picker with VLANs, devices, “any” and “this device”, common ports); a wide spreadsheet-like editor handles many rules at once. Action, direction, source → destination, protocol, ports and comment, with presets (SSH, HTTP/S, RDP, DNS, Ping, Deny all), ordering and validation (bad addresses/ports, rules shadowed by a catch-all). A *Firewall rules table* annotation renders all rules (or those of one device) on the diagram and in exports.

- **Redundant links & bonding**: several links between the same devices are allowed (next free ports suggested). Bonds are first-class objects (`bonds` in the project file): their member links may join **different devices** — a server bonded to the two switches of an MLAG pair, two stacks linked back to back (vPC), etc. The two sides are worked out from the links and from each device's *Redundancy group* (stack / MLAG / vPC / HA). Mode rules follow reality: LACP/static need one device or one redundancy group per side; active-backup and balance-alb/tlb are switch-independent (one host side); multipath and redundant paths accept any combination. Links are drawn without overlaps (spread endpoints, staggered bends), bonds get aggregation marks, labels are placed to avoid collisions, and stacked/HA pairs are laid out side by side. v1.3 projects are migrated automatically.
- **Export**: PNG (1×, 2×, 4K), SVG or PDF; the theme of the drawing (light / dark) is chosen independently from the background (transparent, theme colour or any colour). Choose the content: infrastructure and firewall rules together, infrastructure only, rules only, or both as two separate images (two pages in a PDF). Rules can be exported even when no rules table is drawn.
- **Compact hosts**: hypervisors and Docker hosts have a *Compact view* (header button, properties panel or right-click): every VM, LXC or container becomes one line with only the essentials (name, type, IP, OS or image, VLAN, services); nested hosts become compact blocks. Choose what each line shows (type, IP, other IPs, hostname, OS/image, vCPU/RAM, ports, VLAN, services, description). Drag a line to reorder it; the surrounding zone shrinks to fit.
- **Firewall rule tables on the right**: rule tables are docked to the right edge of the diagram and follow it as the diagram changes (option *Keep on the right of the diagram* on each table).
- **Stacked addresses**: additional IPs and service details are listed one per line, on device cards and in host headers (the guests move down automatically).

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
