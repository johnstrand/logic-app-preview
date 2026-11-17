import '@xyflow/react/dist/style.css';
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type EdgeTypes,
  type NodeMouseHandler,
  type NodeTypes,
} from '@xyflow/react';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { exportWorkflowDiagram, type ExportFormat } from '../../lib/exportImage';
import { getRunAfterVisualStyle } from '../../lib/runAfterStyle';
import type { AppEdge, AppNode } from '../../types/workflow';
import { ActionNode } from './ActionNode';
import { BranchLaneNode } from './BranchLaneNode';
import { ContainerNode } from './ContainerNode';
import { RunAfterEdge } from './RunAfterEdge';

export interface WorkflowCanvasHandle {
  fitView: () => void;
  focusNode: (nodeId: string) => void;
  exportDiagram: (format: ExportFormat, workflowName?: string) => Promise<void>;
}

interface WorkflowCanvasProps {
  nodes: AppNode[];
  edges: AppEdge[];
  theme: 'light' | 'dark';
  fitTriggerKey: number;
  isEmptyGraph: boolean;
  onSelectNode: (nodeId: string | null) => void;
}

const nodeTypes: NodeTypes = {
  workflowNode: ActionNode,
  containerNode: ContainerNode,
  branchLane: BranchLaneNode,
};

const edgeTypes: EdgeTypes = {
  runAfter: RunAfterEdge,
};

const WorkflowCanvasInner = forwardRef<WorkflowCanvasHandle, WorkflowCanvasProps>(
  function WorkflowCanvasInner(
    { nodes, edges, theme, fitTriggerKey, isEmptyGraph, onSelectNode },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const reactFlow = useReactFlow<AppNode, AppEdge>();

    const styledEdges = useMemo<AppEdge[]>(() => {
      return edges.map((edge) => {
        const visual = getRunAfterVisualStyle(edge.data?.statuses, theme);
        return {
          ...edge,
          data: {
            statuses: edge.data?.statuses ?? ['Succeeded'],
            sourceKey: edge.data?.sourceKey ?? '',
            targetKey: edge.data?.targetKey ?? '',
            theme,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 15,
            height: 15,
            color: visual.stroke,
          },
        };
      });
    }, [edges, theme]);

    useEffect(() => {
      if (nodes.length === 0) return;
      const timer = window.requestAnimationFrame(() => {
        reactFlow.fitView({ padding: 0.16, duration: 240, maxZoom: 1.15 });
      });
      return () => window.cancelAnimationFrame(timer);
      // Only re-fit when a newly parsed workflow is loaded
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fitTriggerKey]);

    useImperativeHandle(
      ref,
      () => ({
        fitView: () => {
          reactFlow.fitView({ padding: 0.16, duration: 260, maxZoom: 1.15 });
        },
        focusNode: (nodeId: string) => {
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
              reactFlow.fitView({
                nodes: [{ id: nodeId }],
                duration: 320,
                padding: 0.6,
                maxZoom: 1.15,
              });
            });
          });
        },
        exportDiagram: async (format: ExportFormat, workflowName?: string) => {
          if (!containerRef.current) {
            throw new Error('Canvas element not mounted.');
          }
          await exportWorkflowDiagram(containerRef.current, nodes, format, theme, workflowName);
        },
      }),
      [nodes, reactFlow, theme],
    );

    const handleNodeClick: NodeMouseHandler<AppNode> = (_event, node) => {
      if (node.type === 'branchLane') return;
      onSelectNode(node.id);
    };

    return (
      <div className="wf-canvas-wrapper" ref={containerRef}>
        <ReactFlow<AppNode, AppEdge>
          nodes={nodes}
          edges={styledEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          forceColorMode={theme}
          zIndexMode="manual"
          elevateNodesOnSelect={false}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={true}
          onNodeClick={handleNodeClick}
          onPaneClick={() => onSelectNode(null)}
          fitView
          fitViewOptions={{ padding: 0.16, maxZoom: 1.15 }}
          minZoom={0.08}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1.2}
            color={theme === 'dark' ? '#334155' : '#cbd5e1'}
          />
          <Controls showInteractive={false} position="bottom-left" />
          <MiniMap
            pannable
            zoomable
            position="bottom-right"
            nodeStrokeWidth={2}
            nodeColor={(n) => {
              if (n.type === 'branchLane') return 'transparent';
              if (n.type === 'containerNode') {
                return theme === 'dark' ? '#1e293b' : '#e2e8f0';
              }
              const accent = (n.data as { meta?: { categoryColor?: string } })?.meta
                ?.categoryColor;
              return accent ?? '#0078d4';
            }}
            maskColor={theme === 'dark' ? 'rgba(15, 23, 42, 0.72)' : 'rgba(241, 245, 249, 0.72)'}
          />
        </ReactFlow>

        {isEmptyGraph && (
          <div className="wf-canvas-empty-overlay">
            <div className="wf-canvas-empty-card">
              <h3>No Workflow Loaded</h3>
              <p>
                Paste an Azure Logic Apps Standard <code>workflow.json</code> in the editor on
                the left, drop a <code>.json</code> file, or choose one of the built-in samples.
              </p>
            </div>
          </div>
        )}
      </div>
    );
  },
);

export const WorkflowCanvas = forwardRef<WorkflowCanvasHandle, WorkflowCanvasProps>(
  function WorkflowCanvas(props, ref) {
    return (
      <ReactFlowProvider>
        <WorkflowCanvasInner {...props} ref={ref} />
      </ReactFlowProvider>
    );
  },
);
