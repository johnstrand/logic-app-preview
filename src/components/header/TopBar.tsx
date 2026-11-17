import {
  Check,
  ChevronsDownUp,
  ChevronsUpDown,
  Download,
  Info,
  Maximize2,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Share2,
  Sun,
  Workflow,
} from 'lucide-react';
import type { ExportFormat } from '../../lib/exportImage';
import type { ParsedWorkflow, WorkflowNodeMeta } from '../../types/workflow';
import { SearchCommand } from './SearchCommand';

interface TopBarProps {
  isEditorOpen: boolean;
  theme: 'light' | 'dark';
  parsedWorkflow: ParsedWorkflow | null;
  nodeIndex: Map<string, WorkflowNodeMeta>;
  hasContainers: boolean;
  hasNodes: boolean;
  isWorkflowInfoOpen: boolean;
  shareCopied: boolean;
  onToggleEditor: () => void;
  onToggleTheme: () => void;
  onToggleWorkflowInfo: () => void;
  onSelectSearchResult: (meta: WorkflowNodeMeta) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onFitView: () => void;
  onExport: (format: ExportFormat) => void;
  onShareLink: () => void;
}

export function TopBar({
  isEditorOpen,
  theme,
  parsedWorkflow,
  nodeIndex,
  hasContainers,
  hasNodes,
  isWorkflowInfoOpen,
  shareCopied,
  onToggleEditor,
  onToggleTheme,
  onToggleWorkflowInfo,
  onSelectSearchResult,
  onExpandAll,
  onCollapseAll,
  onFitView,
  onExport,
  onShareLink,
}: TopBarProps) {
  const kindLabel = parsedWorkflow?.kind;
  const isStateless = kindLabel?.toLowerCase() === 'stateless';

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={onToggleEditor}
          title={isEditorOpen ? 'Collapse JSON editor' : 'Show JSON editor'}
          aria-label={isEditorOpen ? 'Collapse JSON editor' : 'Show JSON editor'}
        >
          {isEditorOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
          <span className="hide-sm">{isEditorOpen ? 'Hide JSON' : 'Edit JSON'}</span>
        </button>

        <div className="brand">
          <div className="brand-logo">
            <Workflow size={17} />
          </div>
          <span className="brand-name">Logic App Preview</span>
        </div>

        {parsedWorkflow && (
          <button
            type="button"
            className={`wf-info-pill ${isWorkflowInfoOpen ? 'wf-info-pill--active' : ''}`}
            onClick={onToggleWorkflowInfo}
            title="Inspect workflow parameters, schema & metrics"
          >
            <Info size={13} />
            {kindLabel ? (
              <span
                className={`kind-dot ${
                  isStateless ? 'kind-dot--stateless' : 'kind-dot--stateful'
                }`}
              />
            ) : null}
            <span>{kindLabel || 'Workflow Info'}</span>
          </button>
        )}
      </div>

      <div className="topbar-center">
        <SearchCommand nodeIndex={nodeIndex} onSelectNode={onSelectSearchResult} />
      </div>

      <div className="topbar-right">
        <div className="btn-group">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={onExpandAll}
            disabled={!hasContainers}
            title="Expand all Scope, If, Switch, Foreach, and Until containers"
          >
            <ChevronsUpDown size={15} />
            <span className="hide-md">Expand</span>
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={onCollapseAll}
            disabled={!hasContainers}
            title="Collapse all nested containers"
          >
            <ChevronsDownUp size={15} />
            <span className="hide-md">Collapse</span>
          </button>
        </div>

        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={onFitView}
          disabled={!hasNodes}
          title="Fit workflow diagram to viewport"
        >
          <Maximize2 size={15} />
          <span className="hide-lg">Fit</span>
        </button>

        <div className="btn-group">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => onExport('png')}
            disabled={!hasNodes}
            title="Download diagram as PNG"
          >
            <Download size={14} />
            <span>PNG</span>
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => onExport('svg')}
            disabled={!hasNodes}
            title="Download diagram as SVG"
          >
            <span>SVG</span>
          </button>
        </div>

        <button
          type="button"
          className="btn btn--primary btn--sm"
          onClick={onShareLink}
          disabled={!hasNodes}
          title="Generate compressed shareable URL in hash (#wf=...)"
        >
          {shareCopied ? <Check size={14} /> : <Share2 size={14} />}
          <span>{shareCopied ? 'Copied!' : 'Share'}</span>
        </button>

        <button
          type="button"
          className="btn-icon"
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </header>
  );
}
