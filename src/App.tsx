import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WorkflowCanvas, type WorkflowCanvasHandle } from './components/canvas/WorkflowCanvas';
import { JsonEditorPane } from './components/editor/JsonEditorPane';
import { TopBar } from './components/header/TopBar';
import { InspectorPanel } from './components/inspector/InspectorPanel';
import { WORKFLOW_SAMPLES } from './data/samples';
import type { ExportFormat } from './lib/exportImage';
import { buildWorkflowGraph } from './lib/layout';
import { parseWorkflowJson } from './lib/parser';
import { buildShareableWorkflowUrl, readWorkflowFromUrlHash } from './lib/urlShare';
import type { ParsedWorkflow, WorkflowNodeMeta } from './types/workflow';

function getInitialJson(): { json: string; sampleId: string } {
  const fromHash = readWorkflowFromUrlHash();
  if (fromHash) {
    return { json: fromHash, sampleId: 'custom' };
  }
  return {
    json: WORKFLOW_SAMPLES[0].json,
    sampleId: WORKFLOW_SAMPLES[0].id,
  };
}

function getInitialTheme(): 'light' | 'dark' {
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

export function App() {
  const initial = useMemo(() => getInitialJson(), []);
  const [jsonText, setJsonText] = useState<string>(initial.json);
  const [selectedSampleId, setSelectedSampleId] = useState<string>(initial.sampleId);
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme);
  const [isEditorOpen, setIsEditorOpen] = useState(true);
  const [editorWidth, setEditorWidth] = useState(410);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [inspectorMode, setInspectorMode] = useState<'node' | 'workflow' | null>(null);
  const [searchHighlightedId, setSearchHighlightedId] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [lastValidWorkflow, setLastValidWorkflow] = useState<ParsedWorkflow | null>(() => {
    const res = parseWorkflowJson(initial.json);
    return res.ok ? res.data : null;
  });
  const [fitTriggerKey, setFitTriggerKey] = useState(1);

  const canvasRef = useRef<WorkflowCanvasHandle | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const highlightTimerRef = useRef<number | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
    }, 2800);
  }, []);

  const parseResult = useMemo(() => parseWorkflowJson(jsonText), [jsonText]);

  useEffect(() => {
    if (parseResult.ok) {
      setLastValidWorkflow(parseResult.data);
    } else if (parseResult.error.isEmpty) {
      setLastValidWorkflow(null);
      setSelectedNodeId(null);
      setInspectorMode(null);
    }
  }, [parseResult]);

  const activeWorkflow = parseResult.ok ? parseResult.data : lastValidWorkflow;
  const parseError = parseResult.ok ? null : parseResult.error;

  const handleToggleCollapse = useCallback((containerId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(containerId)) {
        next.delete(containerId);
      } else {
        next.add(containerId);
      }
      return next;
    });
  }, []);

  const graph = useMemo(() => {
    if (!activeWorkflow) {
      return {
        nodes: [],
        edges: [],
        nodeIndex: new Map<string, WorkflowNodeMeta>(),
        containerIds: [],
      };
    }
    return buildWorkflowGraph(activeWorkflow, collapsedIds, selectedNodeId, {
      searchHighlightedId,
      onToggleCollapse: handleToggleCollapse,
    });
  }, [activeWorkflow, collapsedIds, selectedNodeId, searchHighlightedId, handleToggleCollapse]);

  const selectedNodeMeta = useMemo(() => {
    if (!selectedNodeId) return null;
    return graph.nodeIndex.get(selectedNodeId) ?? null;
  }, [graph.nodeIndex, selectedNodeId]);

  const handleJsonChange = (nextText: string) => {
    setJsonText(nextText);
    const matchingSample = WORKFLOW_SAMPLES.find((s) => s.json === nextText);
    setSelectedSampleId(matchingSample ? matchingSample.id : 'custom');
  };

  const handleSelectSample = (sampleId: string) => {
    const sample = WORKFLOW_SAMPLES.find((s) => s.id === sampleId);
    if (!sample) return;
    setJsonText(sample.json);
    setSelectedSampleId(sample.id);
    setCollapsedIds(new Set());
    setSelectedNodeId(null);
    setInspectorMode(null);
    setFitTriggerKey((k) => k + 1);
  };

  const handleSelectNodeOnCanvas = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
    if (nodeId) {
      setInspectorMode('node');
    } else {
      setInspectorMode((prev) => (prev === 'node' ? null : prev));
    }
  }, []);

  const focusAndHighlightNode = useCallback((meta: WorkflowNodeMeta) => {
    if (meta.ancestorContainerIds.length > 0) {
      setCollapsedIds((prev) => {
        let changed = false;
        const next = new Set(prev);
        for (const ancId of meta.ancestorContainerIds) {
          if (next.delete(ancId)) {
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }
    setSelectedNodeId(meta.id);
    setInspectorMode('node');
    setSearchHighlightedId(meta.id);
    if (highlightTimerRef.current !== null) {
      window.clearTimeout(highlightTimerRef.current);
    }
    highlightTimerRef.current = window.setTimeout(() => {
      setSearchHighlightedId(null);
    }, 1800);

    canvasRef.current?.focusNode(meta.id);
  }, []);

  const handleJumpToNodeKey = useCallback(
    (targetKey: string, currentBreadcrumb: string[]) => {
      const candidates = Array.from(graph.nodeIndex.values()).filter((m) => m.key === targetKey);
      if (candidates.length === 0) {
        notify(`Could not find node "${targetKey}".`);
        return;
      }
      const sameScope = candidates.find(
        (c) => c.breadcrumb.join('/') === currentBreadcrumb.join('/'),
      );
      focusAndHighlightNode(sameScope ?? candidates[0]);
    },
    [focusAndHighlightNode, graph.nodeIndex, notify],
  );

  const handleExport = async (format: ExportFormat) => {
    if (!canvasRef.current) return;
    try {
      await canvasRef.current.exportDiagram(
        format,
        activeWorkflow?.workflowName ||
          (selectedSampleId !== 'custom' ? selectedSampleId : 'logic-app-workflow'),
      );
      notify(`Exported diagram as ${format.toUpperCase()}.`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Diagram export failed.');
    }
  };

  const handleShareLink = async () => {
    const url = buildShareableWorkflowUrl(jsonText);
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      notify('Shareable URL copied to clipboard.');
      window.setTimeout(() => setShareCopied(false), 2000);
    } catch {
      notify('Shareable link updated in browser address bar.');
    }
  };

  const startResize = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = editorWidth;

    const onMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const clamped = Math.max(280, Math.min(680, startWidth + delta));
      setEditorWidth(clamped);
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
    };

    document.body.style.cursor = 'col-resize';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <div className="app-shell">
      <TopBar
        isEditorOpen={isEditorOpen}
        theme={theme}
        parsedWorkflow={activeWorkflow}
        nodeIndex={graph.nodeIndex}
        hasContainers={graph.containerIds.length > 0}
        hasNodes={graph.nodes.length > 0}
        isWorkflowInfoOpen={inspectorMode === 'workflow'}
        shareCopied={shareCopied}
        onToggleEditor={() => setIsEditorOpen((prev) => !prev)}
        onToggleTheme={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
        onToggleWorkflowInfo={() =>
          setInspectorMode((prev) => (prev === 'workflow' ? null : 'workflow'))
        }
        onSelectSearchResult={focusAndHighlightNode}
        onExpandAll={() => setCollapsedIds(new Set())}
        onCollapseAll={() => setCollapsedIds(new Set(graph.containerIds))}
        onFitView={() => canvasRef.current?.fitView()}
        onExport={handleExport}
        onShareLink={handleShareLink}
      />

      <main className="workspace">
        {isEditorOpen && (
          <>
            <JsonEditorPane
              value={jsonText}
              selectedSampleId={selectedSampleId}
              theme={theme}
              parsedWorkflow={parseResult.ok ? parseResult.data : null}
              parseError={parseError}
              totalNodeCount={graph.nodeIndex.size}
              width={editorWidth}
              onChange={handleJsonChange}
              onSelectSample={handleSelectSample}
              onNotify={notify}
            />
            <div
              className="split-resizer"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize JSON editor pane"
              onMouseDown={startResize}
            />
          </>
        )}

        <div className="canvas-area">
          <WorkflowCanvas
            ref={canvasRef}
            nodes={graph.nodes}
            edges={graph.edges}
            theme={theme}
            fitTriggerKey={fitTriggerKey}
            isEmptyGraph={graph.nodes.length === 0}
            onSelectNode={handleSelectNodeOnCanvas}
          />
        </div>

        {(inspectorMode === 'workflow' || (inspectorMode === 'node' && selectedNodeMeta)) && (
          <InspectorPanel
            mode={inspectorMode}
            nodeMeta={selectedNodeMeta}
            parsedWorkflow={activeWorkflow}
            nodeIndex={graph.nodeIndex}
            onClose={() => {
              setInspectorMode(null);
              setSelectedNodeId(null);
            }}
            onJumpToNodeKey={handleJumpToNodeKey}
          />
        )}
      </main>

      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  );
}

export default App;
