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
  type NodeChange,
  type NodeTypes,
} from '@xyflow/react';
import { MousePointerClick } from 'lucide-react';
import { useCallback, useEffect, useState, type DragEvent } from 'react';
import { colorOf, getDefinition, getPreset } from '../../data/catalog';
import { fitDiagram, flowApi } from '../../features/canvas/flowApi';
import { computeGuides, type GuideLine } from '../../features/canvas/helperLines';
import { absolutePosition, indexById } from '../../features/nodes/hierarchy';
import { useDiagram } from '../../store/diagramStore';
import { useUi } from '../../store/uiStore';
import type { InfraEdge, InfraNode } from '../../types';
import { ContextMenu } from './ContextMenu';
import { NetworkEdge } from './edges/NetworkEdge';
import { ArrowNode, LegendNode, NoteNode, SeparatorNode, TextNode, TitleNode } from './nodes/AnnotationNodes';
import { ContainerNode } from './nodes/ContainerNode';
import { DeviceNode } from './nodes/DeviceNode';
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
    <div className={presentation ? 'presentation relative h-full w-full' : 'relative h-full w-full'}>
      <ReactFlow<InfraNode, InfraEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={(inst) => {
          flowApi.instance = inst;
          fitDiagram(0);
        }}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeDragStart={(_, node) => useDiagram.getState().checkpoint(`drag:${node.id}:${Date.now()}`)}
        onNodeDragStop={(_, __, dragged) => {
          setGuides({ lines: [], offset: { x: 0, y: 0 } });
          useDiagram.getState().handleDragStop(dragged.map((n) => n.id));
        }}
        onSelectionDragStart={() => useDiagram.getState().checkpoint()}
        onSelectionDragStop={(_, dragged) => useDiagram.getState().handleDragStop(dragged.map((n) => n.id))}
        onNodeContextMenu={(e, node) => {
          e.preventDefault();
          if (presentation) return;
          const inst = flowApi.instance;
          if (!node.selected) useDiagram.getState().select([node.id]);
          useUi.getState().setContextMenu({ x: e.clientX, y: e.clientY, nodeId: node.id, flow: inst?.screenToFlowPosition({ x: e.clientX, y: e.clientY }) ?? { x: 0, y: 0 } });
        }}
        onEdgeContextMenu={(e, edge) => {
          e.preventDefault();
          if (presentation) return;
          useDiagram.getState().select([], [edge.id]);
          useUi.getState().setContextMenu({ x: e.clientX, y: e.clientY, edgeId: edge.id, flow: { x: 0, y: 0 } });
        }}
        onPaneContextMenu={(e) => {
          e.preventDefault();
          if (presentation) return;
          const inst = flowApi.instance;
          useUi.getState().setContextMenu({ x: e.clientX, y: e.clientY, flow: inst?.screenToFlowPosition({ x: e.clientX, y: e.clientY }) ?? { x: 0, y: 0 } });
        }}
        onPaneClick={() => useUi.getState().setContextMenu(null)}
        onMove={(_, vp) => useUi.getState().setZoom(vp.zoom)}
        connectionMode={ConnectionMode.Loose}
        connectionLineType={ConnectionLineType.SmoothStep}
        connectionLineStyle={{ stroke: 'var(--primary)', strokeWidth: 2, strokeDasharray: '6 4' }}
        connectionRadius={28}
        snapToGrid={settings.snapToGrid}
        snapGrid={[8, 8]}
        selectionMode={SelectionMode.Partial}
        selectionOnDrag={!presentation}
        panOnDrag={presentation ? true : [1]}
        panActivationKeyCode="Space"
        multiSelectionKeyCode={['Meta', 'Control', 'Shift']}
        deleteKeyCode={null}
        nodesDraggable={!presentation}
        nodesConnectable={!presentation}
        elementsSelectable={!presentation}
        elevateNodesOnSelect={false}
        minZoom={0.08}
        maxZoom={3}
        colorMode={theme}
        proOptions={{ hideAttribution: true }}
        fitView
        fitViewOptions={{ padding: 0.12, maxZoom: 1.25 }}
      >
        {settings.showGrid && !presentation && <Background variant={BackgroundVariant.Dots} gap={16} size={1.3} />}
        {settings.showMinimap && !presentation && (
          <MiniMap
            pannable
            zoomable
            nodeStrokeWidth={2}
            nodeColor={(n) => {
              const def = getDefinition((n as InfraNode).data.type);
              return def.kind === 'zone' ? 'transparent' : colorOf(def);
            }}
            nodeStrokeColor={(n) => colorOf(getDefinition((n as InfraNode).data.type))}
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
