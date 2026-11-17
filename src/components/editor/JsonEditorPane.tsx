import { json } from '@codemirror/lang-json';
import CodeMirror from '@uiw/react-codemirror';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardPaste,
  FileCode2,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { useMemo, useRef, useState, type DragEvent } from 'react';
import { WORKFLOW_SAMPLES } from '../../data/samples';
import type { DetectedFormat, ParseError, ParsedWorkflow } from '../../types/workflow';

interface JsonEditorPaneProps {
  value: string;
  selectedSampleId: string;
  theme: 'light' | 'dark';
  parsedWorkflow: ParsedWorkflow | null;
  parseError: ParseError | null;
  totalNodeCount: number;
  width: number;
  onChange: (nextValue: string) => void;
  onSelectSample: (sampleId: string) => void;
  onNotify: (message: string) => void;
}

const FORMAT_LABELS: Record<DetectedFormat, string> = {
  standard: 'Standard workflow.json',
  'wdl-definition': 'Bare WDL definition',
  'arm-resource': 'ARM workflow resource',
  'arm-template': 'ARM template',
};

export function JsonEditorPane({
  value,
  selectedSampleId,
  theme,
  parsedWorkflow,
  parseError,
  totalNodeCount,
  width,
  onChange,
  onSelectSample,
  onNotify,
}: JsonEditorPaneProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const extensions = useMemo(() => [json()], []);

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        onNotify('Clipboard is empty.');
        return;
      }
      onChange(text);
      onNotify('Pasted JSON from clipboard.');
    } catch {
      onNotify('Clipboard access denied — paste directly into the editor with Ctrl+V.');
    }
  };

  const handleFormat = () => {
    try {
      const obj = JSON.parse(value);
      onChange(JSON.stringify(obj, null, 2));
      onNotify('Formatted JSON.');
    } catch {
      onNotify('Fix JSON syntax errors before formatting.');
    }
  };

  const handleFileLoad = async (file: File) => {
    try {
      const text = await file.text();
      onChange(text);
      onNotify(`Loaded ${file.name}`);
    } catch {
      onNotify(`Could not read ${file.name}`);
    }
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await handleFileLoad(file);
    }
  };

  const triggerCount = parsedWorkflow
    ? Object.keys(parsedWorkflow.definition.triggers).length
    : 0;
  const actionCount = Math.max(0, totalNodeCount - triggerCount);

  return (
    <aside
      className={`editor-pane ${isDragging ? 'editor-pane--dragging' : ''}`}
      style={{ width }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsDragging(false);
        }
      }}
      onDrop={handleDrop}
    >
      <div className="editor-toolbar">
        <div className="editor-sample-row">
          <FileCode2 size={15} className="editor-sample-icon" />
          <select
            className="editor-sample-select"
            value={selectedSampleId}
            onChange={(e) => onSelectSample(e.target.value)}
            aria-label="Load sample workflow"
          >
            {selectedSampleId === 'custom' && (
              <option value="custom">Custom pasted workflow.json</option>
            )}
            {WORKFLOW_SAMPLES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="editor-actions-row">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={handlePasteClipboard}
            title="Paste workflow JSON from clipboard"
          >
            <ClipboardPaste size={14} />
            <span>Paste</span>
          </button>

          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => fileInputRef.current?.click()}
            title="Open a local workflow.json file"
          >
            <Upload size={14} />
            <span>Open</span>
          </button>

          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={handleFormat}
            title="Pretty-print JSON"
            disabled={!value.trim()}
          >
            <Sparkles size={14} />
            <span>Format</span>
          </button>

          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => onChange('')}
            title="Clear editor"
            disabled={!value.trim()}
          >
            <Trash2 size={14} />
            <span>Clear</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json,text/plain"
            className="sr-only"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) await handleFileLoad(file);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      <div className="editor-codemirror-host">
        <CodeMirror
          value={value}
          height="100%"
          theme={theme === 'dark' ? 'dark' : 'light'}
          extensions={extensions}
          onChange={onChange}
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            highlightActiveLine: true,
            bracketMatching: true,
            autocompletion: false,
          }}
        />
        {isDragging && (
          <div className="editor-drop-overlay">
            <Upload size={28} />
            <span>Drop workflow.json to preview</span>
          </div>
        )}
      </div>

      <div
        className={`editor-status ${
          parseError
            ? parseError.isEmpty
              ? 'editor-status--neutral'
              : 'editor-status--error'
            : 'editor-status--valid'
        }`}
      >
        {parseError ? (
          <>
            <AlertCircle size={15} className="editor-status-icon" />
            <span className="editor-status-text">
              {parseError.line !== undefined
                ? `Line ${parseError.line}, Col ${parseError.column ?? 1}: `
                : ''}
              {parseError.message}
            </span>
          </>
        ) : parsedWorkflow ? (
          <>
            <CheckCircle2 size={15} className="editor-status-icon" />
            <span className="editor-status-text">
              {FORMAT_LABELS[parsedWorkflow.format]}
              {parsedWorkflow.kind ? ` · ${parsedWorkflow.kind}` : ''}
              {` · ${triggerCount} trigger${triggerCount === 1 ? '' : 's'} · ${actionCount} action${actionCount === 1 ? '' : 's'}`}
            </span>
          </>
        ) : null}
      </div>
    </aside>
  );
}
