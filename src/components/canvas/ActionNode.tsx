import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { WorkflowFlowNode } from '../../types/workflow';
import { ActionIcon } from '../common/ActionIcon';

export function ActionNode({ data }: NodeProps<WorkflowFlowNode>) {
  const { meta, isSelected, isSearchHighlighted } = data;

  return (
    <div
      className={[
        'wf-node-card',
        meta.isTrigger ? 'wf-node-card--trigger' : '',
        isSelected ? 'wf-node-card--selected' : '',
        isSearchHighlighted ? 'wf-node-card--highlighted' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ '--node-accent': meta.categoryColor } as React.CSSProperties}
    >
      {!meta.isTrigger && (
        <Handle type="target" position={Position.Top} className="wf-handle" />
      )}

      <div className="wf-node-accent" />

      <div className="wf-node-body">
        <div
          className="wf-node-icon"
          style={{
            backgroundColor: `${meta.categoryColor}18`,
            color: meta.categoryColor,
          }}
        >
          <ActionIcon name={meta.iconName} size={18} />
        </div>

        <div className="wf-node-text">
          <div className="wf-node-title-row">
            <span className="wf-node-title" title={meta.key}>
              {meta.label}
            </span>
            {meta.isTrigger && <span className="wf-trigger-pill">TRIGGER</span>}
          </div>
          <div className="wf-node-subtitle" title={meta.subtitle}>
            {meta.subtitle}
          </div>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="wf-handle" />
    </div>
  );
}
