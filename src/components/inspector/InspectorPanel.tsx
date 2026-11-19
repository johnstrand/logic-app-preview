import { Check, Copy, Info, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type {
  DetectedFormat,
  ParsedWorkflow,
  RawAction,
  RawTrigger,
  WorkflowNodeMeta,
} from '../../types/workflow';
import { ActionIcon } from '../common/ActionIcon';
import { ExpressionValue } from './ExpressionValue';
import { HighlightedJson } from './HighlightedJson';

type InspectorTab = 'inputs' | 'settings' | 'raw';

interface InspectorPanelProps {
  mode: 'node' | 'workflow';
  nodeMeta: WorkflowNodeMeta | null;
  parsedWorkflow: ParsedWorkflow | null;
  nodeIndex: Map<string, WorkflowNodeMeta>;
  onClose: () => void;
  onJumpToNodeKey: (targetKey: string, currentBreadcrumb: string[]) => void;
}

const FORMAT_DESCRIPTIONS: Record<DetectedFormat, string> = {
  standard: 'Azure Logic Apps Standard (workflow.json)',
  'wdl-definition': 'Bare Workflow Definition Language (WDL)',
  'arm-resource': 'Azure Resource Manager Workflow Resource',
  'arm-template': 'Azure Resource Manager Deployment Template',
};

function getStatusChipClass(status: string): string {
  switch (status.toLowerCase()) {
    case 'succeeded':
      return 'status-chip status-chip--succeeded';
    case 'failed':
      return 'status-chip status-chip--failed';
    case 'timedout':
      return 'status-chip status-chip--timedout';
    case 'skipped':
      return 'status-chip status-chip--skipped';
    default:
      return 'status-chip';
  }
}

export function InspectorPanel({
  mode,
  nodeMeta,
  parsedWorkflow,
  nodeIndex,
  onClose,
  onJumpToNodeKey,
}: InspectorPanelProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>('inputs');
  const [copiedRaw, setCopiedRaw] = useState(false);

  const rawJsonText = useMemo(() => {
    if (mode !== 'node' || !nodeMeta || activeTab !== 'raw') return '';
    return JSON.stringify({ [nodeMeta.key]: nodeMeta.raw }, null, 2);
  }, [mode, nodeMeta, activeTab]);

  const handleCopyJson = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedRaw(true);
      window.setTimeout(() => setCopiedRaw(false), 1600);
    } catch {
      // Ignore clipboard failures
    }
  };

  if (mode === 'workflow' && parsedWorkflow) {
    const def = parsedWorkflow.definition;
    const allMeta = Array.from(nodeIndex.values());
    const triggerCount = allMeta.filter((m) => m.isTrigger).length;
    const containerCount = allMeta.filter((m) => m.nodeKind === 'container').length;
    const leafActionCount = allMeta.filter((m) => m.nodeKind === 'action').length;
    const paramEntries = Object.entries(def.parameters ?? {});
    const outputEntries = Object.entries(def.outputs ?? {});

    return (
      <aside className="inspector-pane" aria-label="Workflow summary">
        <div className="inspector-header">
          <div className="inspector-header-main">
            <div
              className="inspector-icon"
              style={{ backgroundColor: '#0078d41a', color: '#0078d4' }}
            >
              <Info size={18} />
            </div>
            <div className="inspector-titles">
              <div className="inspector-title">
                {parsedWorkflow.workflowName || 'Workflow Overview'}
              </div>
              <div className="inspector-pills">
                {parsedWorkflow.kind && (
                  <span
                    className={`kind-badge ${
                      parsedWorkflow.kind.toLowerCase() === 'stateless'
                        ? 'kind-badge--stateless'
                        : 'kind-badge--stateful'
                    }`}
                  >
                    {parsedWorkflow.kind}
                  </span>
                )}
                <span className="type-badge">{FORMAT_DESCRIPTIONS[parsedWorkflow.format]}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            aria-label="Close workflow summary"
          >
            <X size={16} />
          </button>
        </div>

        <div className="inspector-scroll">
          <section className="inspector-section">
            <h4 className="inspector-section-title">Metrics</h4>
            <div className="metrics-grid">
              <div className="metric-card">
                <div className="metric-value">{triggerCount}</div>
                <div className="metric-label">Triggers</div>
              </div>
              <div className="metric-card">
                <div className="metric-value">{leafActionCount}</div>
                <div className="metric-label">Actions</div>
              </div>
              <div className="metric-card">
                <div className="metric-value">{containerCount}</div>
                <div className="metric-label">Containers</div>
              </div>
            </div>
          </section>

          <section className="inspector-section">
            <h4 className="inspector-section-title">Metadata</h4>
            <div className="meta-table">
              <div className="meta-row">
                <span className="meta-k">Content Version</span>
                <span className="meta-v">{def.contentVersion || '—'}</span>
              </div>
              <div className="meta-row">
                <span className="meta-k">Schema</span>
                <span className="meta-v meta-v--mono">{def.$schema || '—'}</span>
              </div>
            </div>
          </section>

          <section className="inspector-section">
            <h4 className="inspector-section-title">
              Parameters ({paramEntries.length})
            </h4>
            {paramEntries.length === 0 ? (
              <p className="inspector-muted">No workflow parameters defined.</p>
            ) : (
              <ExpressionValue value={def.parameters} />
            )}
          </section>

          <section className="inspector-section">
            <h4 className="inspector-section-title">Outputs ({outputEntries.length})</h4>
            {outputEntries.length === 0 ? (
              <p className="inspector-muted">No workflow outputs defined.</p>
            ) : (
              <ExpressionValue value={def.outputs} />
            )}
          </section>
        </div>
      </aside>
    );
  }

  if (!nodeMeta) return null;

  const rawTrigger = nodeMeta.isTrigger ? (nodeMeta.raw as RawTrigger) : null;
  const rawAction = !nodeMeta.isTrigger ? (nodeMeta.raw as RawAction) : null;
  const runAfterEntries = Object.entries(rawAction?.runAfter ?? {});

  const inputBlocks: Array<{ label: string; data: unknown }> = [];
  if (rawAction?.foreach !== undefined) {
    inputBlocks.push({ label: 'For Each Collection', data: rawAction.foreach });
  }
  if (rawAction?.expression !== undefined) {
    inputBlocks.push({ label: 'Expression / Condition', data: rawAction.expression });
  }
  if (rawTrigger?.recurrence !== undefined) {
    inputBlocks.push({ label: 'Recurrence Schedule', data: rawTrigger.recurrence });
  }
  if (nodeMeta.raw.inputs !== undefined) {
    inputBlocks.push({ label: 'Inputs', data: nodeMeta.raw.inputs });
  }
  if (rawAction?.cases !== undefined) {
    const caseSummary = Object.fromEntries(
      Object.entries(rawAction.cases).map(([k, v]) => [
        k,
        {
          case: v?.case,
          actionCount: Object.keys(v?.actions ?? {}).length,
        },
      ]),
    );
    inputBlocks.push({ label: 'Switch Cases', data: caseSummary });
  }

  const settingEntries: Array<{ label: string; data: unknown }> = [];
  if (nodeMeta.raw.description) {
    settingEntries.push({ label: 'Description', data: nodeMeta.raw.description });
  }
  if (rawTrigger?.splitOn !== undefined) {
    settingEntries.push({ label: 'Split On', data: rawTrigger.splitOn });
  }
  if (rawTrigger?.conditions !== undefined) {
    settingEntries.push({ label: 'Trigger Conditions', data: rawTrigger.conditions });
  }
  if (rawAction?.limit !== undefined) {
    settingEntries.push({ label: 'Loop / Action Limits', data: rawAction.limit });
  }
  if (rawAction?.timeout !== undefined) {
    settingEntries.push({ label: 'Timeout', data: rawAction.timeout });
  }
  if (rawAction?.retryPolicy !== undefined) {
    settingEntries.push({ label: 'Retry Policy', data: rawAction.retryPolicy });
  }
  if (nodeMeta.raw.runtimeConfiguration !== undefined) {
    settingEntries.push({
      label: 'Runtime Configuration',
      data: nodeMeta.raw.runtimeConfiguration,
    });
  }
  if (rawAction?.trackedProperties !== undefined) {
    settingEntries.push({
      label: 'Tracked Properties',
      data: rawAction.trackedProperties,
    });
  }
  if (rawAction?.operationOptions !== undefined) {
    settingEntries.push({
      label: 'Operation Options',
      data: rawAction.operationOptions,
    });
  }

  return (
    <aside className="inspector-pane" aria-label="Node inspector">
      <div className="inspector-header">
        <div className="inspector-header-main">
          <div
            className="inspector-icon"
            style={{
              backgroundColor: `${nodeMeta.categoryColor}1f`,
              color: nodeMeta.categoryColor,
            }}
          >
            <ActionIcon name={nodeMeta.iconName} size={18} />
          </div>
          <div className="inspector-titles">
            <div className="inspector-title" title={nodeMeta.key}>
              {nodeMeta.label}
            </div>
            <div className="inspector-subtitle-key">{nodeMeta.key}</div>
            <div className="inspector-pills">
              <span className="type-badge">{nodeMeta.actionType}</span>
              {typeof nodeMeta.raw.kind === 'string' && (
                <span className="type-badge">{nodeMeta.raw.kind}</span>
              )}
              {nodeMeta.isTrigger && <span className="wf-trigger-pill">TRIGGER</span>}
            </div>
          </div>
        </div>
        <button
          type="button"
          className="btn-icon"
          onClick={onClose}
          aria-label="Close inspector"
        >
          <X size={16} />
        </button>
      </div>

      {nodeMeta.breadcrumb.length > 0 && (
        <div className="inspector-breadcrumb">
          {nodeMeta.breadcrumb.join(' › ')}
        </div>
      )}

      <div className="inspector-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'inputs'}
          className={`inspector-tab ${activeTab === 'inputs' ? 'inspector-tab--active' : ''}`}
          onClick={() => setActiveTab('inputs')}
        >
          Inputs
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'settings'}
          className={`inspector-tab ${activeTab === 'settings' ? 'inspector-tab--active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          Settings &amp; Run After
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'raw'}
          className={`inspector-tab ${activeTab === 'raw' ? 'inspector-tab--active' : ''}`}
          onClick={() => setActiveTab('raw')}
        >
          Raw JSON
        </button>
      </div>

      <div className="inspector-scroll">
        {activeTab === 'inputs' && (
          <>
            {inputBlocks.length === 0 ? (
              <p className="inspector-muted">
                This {nodeMeta.isTrigger ? 'trigger' : 'action'} has no configured inputs.
              </p>
            ) : (
              inputBlocks.map((block) => (
                <section key={block.label} className="inspector-section">
                  <h4 className="inspector-section-title">{block.label}</h4>
                  <ExpressionValue value={block.data} />
                </section>
              ))
            )}
          </>
        )}

        {activeTab === 'settings' && (
          <>
            <section className="inspector-section">
              <h4 className="inspector-section-title">Run After Dependencies</h4>
              {nodeMeta.isTrigger ? (
                <p className="inspector-muted">
                  Entry trigger — initiates execution of the workflow.
                </p>
              ) : runAfterEntries.length === 0 ? (
                <p className="inspector-muted">
                  {nodeMeta.breadcrumb.length === 0
                    ? 'Runs immediately after the workflow trigger.'
                    : 'Runs first inside its parent branch/scope.'}
                </p>
              ) : (
                <div className="runafter-list">
                  {runAfterEntries.map(([depKey, statuses]) => (
                    <div key={depKey} className="runafter-item">
                      <button
                        type="button"
                        className="runafter-link"
                        onClick={() => onJumpToNodeKey(depKey, nodeMeta.breadcrumb)}
                        title={`Jump to ${depKey}`}
                      >
                        {depKey}
                      </button>
                      <div className="runafter-statuses">
                        {(Array.isArray(statuses) ? statuses : ['Succeeded']).map((st) => (
                          <span key={st} className={getStatusChipClass(String(st))}>
                            {String(st)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="inspector-section">
              <h4 className="inspector-section-title">Runtime &amp; Retry Settings</h4>
              {settingEntries.length === 0 ? (
                <p className="inspector-muted">No custom runtime, retry, or timeout settings.</p>
              ) : (
                settingEntries.map((entry) => (
                  <div key={entry.label} className="inspector-subblock">
                    <div className="inspector-sublabel">{entry.label}</div>
                    <ExpressionValue value={entry.data} />
                  </div>
                ))
              )}
            </section>
          </>
        )}

        {activeTab === 'raw' && (
          <section className="inspector-section">
            <div className="raw-json-toolbar">
              <span className="inspector-section-title">Node Definition</span>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => handleCopyJson(rawJsonText)}
              >
                {copiedRaw ? <Check size={14} /> : <Copy size={14} />}
                <span>{copiedRaw ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <HighlightedJson json={rawJsonText} />
          </section>
        )}
      </div>
    </aside>
  );
}
