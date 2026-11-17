import type { NodeProps } from '@xyflow/react';
import type { BranchLaneFlowNode } from '../../types/workflow';

export function BranchLaneNode({ data }: NodeProps<BranchLaneFlowNode>) {
  const { label, subtitle, variant, isEmpty } = data;

  return (
    <div className={`wf-lane wf-lane--${variant}`}>
      <div className="wf-lane-header">
        <span className={`wf-lane-pill wf-lane-pill--${variant}`}>{label}</span>
        {subtitle && (
          <span className="wf-lane-subtitle" title={subtitle}>
            {subtitle}
          </span>
        )}
      </div>
      {isEmpty && <div className="wf-lane-empty">No actions in branch</div>}
    </div>
  );
}
