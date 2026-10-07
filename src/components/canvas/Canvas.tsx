import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  ConnectionMode,
  MiniMap,
  ReactFlow,
  SelectionMode,
  ViewportPortal,
  type EdgeTypes,
  type ReactFlowInstance,
  type NodeChange,
  type NodeTypes,
} from '@xyflow/react';
import { MousePointerClick } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type DragEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { colorOf, getDefinition, getPreset } from '../../data/catalog';
import { fitDiagram, flowApi } from '../../features/canvas/flowApi';
import { computeGuides, type GuideLine } from '../../features/canvas/helperLines';
import { absolutePosition, descendantIds, indexById } from '../../features/nodes/hierarchy';
import { applyView, viewOf } from '../../features/canvas/views';
import { LOD } from '../../features/canvas/lod';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { cn } from '../ui/cn';
import { useDiagram } from '../../store/diagramStore';
import { useUi } from '../../store/uiStore';
import type { InfraEdge, InfraNode } from '../../types';
import { ContextMenu } from './ContextMenu';
import { NetworkEdge } from './edges/NetworkEdge';
import { ArrowNode, LegendNode, NoteNode, SeparatorNode, TextNode, TitleNode } from './nodes/AnnotationNodes';
import { ContainerNode } from './nodes/ContainerNode';
import { DeviceNode } from './nodes/DeviceNode';
import { RulesTableNode } from './nodes/RulesTableNode';
import { ZoneNode } from './nodes/ZoneNode';

export const LIBRARY_MIME = 'application/x-infracanvas-preset';

const nodeTypes: NodeTypes = {
  device: DeviceNode,
  container: ContainerNode,
  zone: ZoneNode,
  title: TitleNode,
  text: TextNode,
  note: NoteNode,
  legend: LegendNode,
  separator: SeparatorNode,
  arrow: ArrowNode,
  rulesTable: RulesTableNode,
};

const edgeTypes: EdgeTypes = { network: NetworkEdge };

function Guides({ lines, parentOffset }: { lines: GuideLine[]; parentOffset: { x: number; y: number } }) {
  return (
    <ViewportPortal>
      {lines.map((l, i) => (
        <div
          key={i}
          className="helper-line pointer-events-none absolute bg-pink-500"
          style={
            l.orientation === 'vertical'
              ? { left: l.at + parentOffset.x, top: l.from + parentOffset.y, width: 1, height: l.to - l.from }
              : { top: l.at + parentOffset.y, left: l.from + parentOffset.x, height: 1, width: l.to - l.from }
          }
        />
      ))}
    </ViewportPortal>
  );
}

function EmptyState() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="max-w-sm animate-fade-in rounded-2xl border border-dashed border-line-strong bg-surface/80 px-8 py-7 text-center backdrop-blur">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <MousePointerClick size={22} />
        </div>
        <h3 className="text-[15px] font-semibold text-fg">Start your diagram</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          Drag equipment from the library on the left, or pick a template from the <span className="font-medium text-fg">File</span> menu.
          Connect two elements by dragging from one of their edge dots.
        </p>
      </div>
    </div>
  );
}

/*
 * Handlers and options passed to React Flow are module-level constants: React
 * Flow forwards them to every node and link, and a new function identity on
 * each render would re-render all of them on every frame of a drag.
 */
const CONNECTION_LINE_STYLE = { stroke: 'var(--primary)', strokeWidth: 2, strokeDasharray: '6 4' };
const SNAP_GRID: [number, number] = [8, 8];
const PAN_BUTTONS = [1];
const MULTI_SELECT_KEYS = ['Meta', 'Control', 'Shift'];
const PRO_OPTIONS = { hideAttribution: true };
const FIT_VIEW_OPTIONS = { padding: 0.12, maxZoom: 1.25 };

const presenting = () => useUi.getState().presentation;
const flowPoint = (e: { clientX: number; clientY: number }) => flowApi.instance?.screenToFlowPosition({ x: e.clientX, y: e.clientY }) ?? { x: 0, y: 0 };

const onInit = (inst: ReactFlowInstance<InfraNode, InfraEdge>) => {
  flowApi.instance = inst;
  fitDiagram(0);
};
const onNodeDragStart = (_: unknown, node: InfraNode) => useDiagram.getState().checkpoint(`drag:${node.id}:${Date.now()}`);
const onSelectionDragStart = () => useDiagram.getState().checkpoint();
const onSelectionDragStop = (_: unknown, dragged: InfraNode[]) => useDiagram.getState().handleDragStop(dragged.map((n) => n.id));
const onNodeContextMenu = (e: ReactMouseEvent, node: InfraNode) => {
  e.preventDefault();
  if (presenting()) return;
  if (!node.selected) useDiagram.getState().select([node.id]);
  useUi.getState().setContextMenu({ x: e.clientX, y: e.clientY, nodeId: node.id, flow: flowPoint(e) });
};
const onEdgeContextMenu = (e: ReactMouseEvent, edge: InfraEdge) => {
  e.preventDefault();
  if (presenting()) return;
  useDiagram.getState().select([], [edge.id]);
  useUi.getState().setContextMenu({ x: e.clientX, y: e.clientY, edgeId: edge.id, flow: { x: 0, y: 0 } });
};
const onPaneContextMenu = (e: ReactMouseEvent | MouseEvent) => {
  e.preventDefault();
  if (presenting()) return;
  useUi.getState().setContextMenu({ x: e.clientX, y: e.clientY, flow: flowPoint(e) });
};
const onPaneClick = () => useUi.getState().setContextMenu(null);
const onNodeMouseEnter = (_: unknown, node: InfraNode) => presenting() && useUi.getState().setFocusNode(node.id);
const onNodeMouseLeave = () => presenting() && useUi.getState().setFocusNode(null);
const onMove = (_: unknown, vp: { zoom: number }) => useUi.getState().setZoom(vp.zoom);
const minimapColor = (n: InfraNode) => {
  const def = getDefinition(n.data.type);
  return def.kind === 'zone' ? 'transparent' : colorOf(def);
};
const minimapStroke = (n: InfraNode) => colorOf(getDefinition(n.data.type));

export function Canvas() {
  const nodes = useDiagram((s) => s.nodes);
  const edges = useDiagram((s) => s.edges);
  const settings = useDiagram((s) => s.settings);
  const fitRequest = useDiagram((s) => s.fitRequest);
  const onNodesChange = useDiagram((s) => s.onNodesChange);
  const onEdgesChange = useDiagram((s) => s.onEdgesChange);
  const onConnect = useDiagram((s) => s.onConnect);
  const presentation = useUi((s) => s.presentation);
  const theme = useUi((s) => s.theme);
  const focusNode = useUi((s) => s.focusNode);
  const exporting = useUi((s) => s.exporting);
  const large = nodes.length >= LOD.minNodes;
  const presentationAnim = useUi((s) => s.presentationAnim);
  const reducedMotion = useReducedMotion();
  // Entrance animation when the presentation starts.
  const [entering, setEntering] = useState(false);
  useEffect(() => {
    if (!presentation || reducedMotion) return;
    setEntering(true);
    const t = setTimeout(() => setEntering(false), 1900);
    return () => clearTimeout(t);
  }, [presentation, reducedMotion]);

  // Current view (hidden layers, security dimming).
  const layered = useMemo(() => applyView(nodes, edges, viewOf(settings)), [nodes, edges, settings]);

  // Display copies for the presentation (entrance order, focus dimming). The project is never modified.
  const view = useMemo(() => {
    const { nodes, edges } = layered;
    if (!presentation) return layered;
    const byId = indexById(nodes);
    let lit: Set<string> | null = null;
    let litEdges: Set<string> | null = null;
    if (focusNode && byId.has(focusNode)) {
      const core = new Set([focusNode, ...descendantIds(focusNode, nodes)]);
      litEdges = new Set(edges.filter((e) => core.has(e.source) || core.has(e.target)).map((e) => e.id));
      lit = new Set(core);
      for (const e of edges) if (litEdges.has(e.id)) [e.source, e.target].forEach((id) => lit!.add(id));
      // Keep the containers of highlighted devices visible.
      for (const id of [...lit]) {
        let p = byId.get(id)?.parentId;
        while (p) {
          lit.add(p);
          p = byId.get(p)?.parentId;
        }
      }
    }
    let minY = Infinity;
    let maxY = -Infinity;
    const absY = new Map<string, number>();
    if (entering) {
      for (const n of nodes) {
        const y = absolutePosition(n, byId).y;
        absY.set(n.id, y);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
    const span = Math.max(1, maxY - minY);
    return {
      nodes: nodes.map((n) => {
        const dim = lit && !lit.has(n.id);
        if (!dim && !entering) return n;
        return {
          ...n,
          className: cn(n.className, dim && 'is-dimmed', entering && 'presentation-enter'),
          // Top to bottom: traffic flows down from the Internet edge to the hosts.
          style: entering ? { ...n.style, ['--enter-delay' as string]: `${Math.round(((absY.get(n.id)! - minY) / span) * 900)}ms` } : n.style,
        };
      }),
      edges: litEdges ? edges.map((e) => ({ ...e, data: { ...e.data!, _focus: litEdges!.has(e.id) ? 'on' : 'off' } })) : edges,
    };
  }, [presentation, layered, focusNode, entering]);

  const [guides, setGuides] = useState<{ lines: GuideLine[]; offset: { x: number; y: number } }>({ lines: [], offset: { x: 0, y: 0 } });

  useEffect(() => {
    if (fitRequest > 0) fitDiagram(fitRequest === 1 ? 0 : 400);
  }, [fitRequest]);

  const handleNodesChange = useCallback(
    (changes: NodeChange<InfraNode>[]) => {
      const st = useDiagram.getState();
      const single = changes.length === 1 && changes[0].type === 'position' && changes[0].dragging ? changes[0] : null;
      if (single && single.type === 'position' && single.position) {
        const result = computeGuides(single, st.nodes);
        if (result.x !== undefined) single.position.x = result.x;
        if (result.y !== undefined) single.position.y = result.y;
        const node = st.nodes.find((n) => n.id === single.id);
        const parent = node?.parentId ? st.nodes.find((n) => n.id === node.parentId) : undefined;
        const offset = parent ? absolutePosition(parent, indexById(st.nodes)) : { x: 0, y: 0 };
        setGuides({ lines: result.lines, offset });
      } else if (guides.lines.length && !changes.some((c) => c.type === 'position' && c.dragging)) {
        setGuides({ lines: [], offset: { x: 0, y: 0 } });
      }
      onNodesChange(changes);
    },
    [onNodesChange, guides.lines.length],
  );

  const onNodeDragStop = useCallback((_: unknown, __: unknown, dragged: InfraNode[]) => {
    setGuides({ lines: [], offset: { x: 0, y: 0 } });
    useDiagram.getState().handleDragStop(dragged.map((n) => n.id));
  }, []);

  const onDragOver = useCallback((e: DragEvent) => {
    if (!e.dataTransfer.types.includes(LIBRARY_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDrop = useCallback((e: DragEvent) => {
    const presetId = e.dataTransfer.getData(LIBRARY_MIME);
    if (!presetId) return;
    e.preventDefault();
    const preset = getPreset(presetId);
    const inst = flowApi.instance;
    if (!preset || !inst) return;
    const at = inst.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    useDiagram.getState().addPreset(preset, at);
  }, []);

  const empty = nodes.length === 0;

  return (
    <div className={cn('relative h-full w-full', presentation && 'presentation', entering && 'presentation-entering', presentation && presentationAnim && !reducedMotion && 'presentation-animated')}>
      <ReactFlow<InfraNode, InfraEdge>
        nodes={view.nodes}
        edges={view.edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={onInit}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onSelectionDragStart={onSelectionDragStart}
        onSelectionDragStop={onSelectionDragStop}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onPaneClick={onPaneClick}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onMove={onMove}
        connectionMode={ConnectionMode.Loose}
        connectionLineType={ConnectionLineType.SmoothStep}
        connectionLineStyle={CONNECTION_LINE_STYLE}
        connectionRadius={28}
        snapToGrid={settings.snapToGrid}
        snapGrid={SNAP_GRID}
        selectionMode={SelectionMode.Partial}
        selectionOnDrag={!presentation}
        panOnDrag={presentation ? true : PAN_BUTTONS}
        panActivationKeyCode="Space"
        multiSelectionKeyCode={MULTI_SELECT_KEYS}
        deleteKeyCode={null}
        nodesDraggable={!presentation}
        nodesConnectable={!presentation}
        elementsSelectable={!presentation}
        elevateNodesOnSelect={false}
        // Large diagrams: only what is on screen is in the DOM (an export renders everything).
        onlyRenderVisibleElements={large && !exporting}
        minZoom={0.08}
        maxZoom={3}
        colorMode={theme}
        proOptions={PRO_OPTIONS}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
      >
        {settings.showGrid && !presentation && <Background variant={BackgroundVariant.Dots} gap={16} size={1.3} />}
        {settings.showMinimap && !presentation && (
          <MiniMap
            pannable
            zoomable
            nodeStrokeWidth={2}
            nodeColor={minimapColor}
            nodeStrokeColor={minimapStroke}
            maskColor="rgb(100 116 139 / 0.12)"
          />
        )}
        {guides.lines.length > 0 && <Guides lines={guides.lines} parentOffset={guides.offset} />}
      </ReactFlow>
      {empty && !presentation && <EmptyState />}
      <ContextMenu />
    </div>
  );
}
