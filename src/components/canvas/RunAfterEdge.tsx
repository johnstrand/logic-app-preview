import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react';
import { getRunAfterVisualStyle } from '../../lib/runAfterStyle';
import type { AppEdge } from '../../types/workflow';

export function RunAfterEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps<AppEdge>) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 10,
  });

  const theme = data?.theme ?? 'light';
  const visual = getRunAfterVisualStyle(data?.statuses, theme);

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: visual.stroke,
          strokeWidth: visual.isDefaultSucceededOnly ? 1.75 : 2,
          strokeDasharray: visual.dashArray,
        }}
      />
      {!visual.isDefaultSucceededOnly && visual.label && (
        <EdgeLabelRenderer>
          <div
            className={`wf-edge-badge wf-edge-badge--${visual.badgeClass} nodrag nopan`}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
            title={`runAfter: ${visual.label}`}
          >
            {visual.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
