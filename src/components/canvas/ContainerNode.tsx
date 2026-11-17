import { Handle, Position, type NodeProps } from '@xyflow/react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ContainerFlowNode } from '../../types/workflow';
import { ActionIcon } from '../common/ActionIcon';

export function ContainerNode({ id, data }: NodeProps<ContainerFlowNode>) {
  const {
    meta,
    isCollapsed,
    isSelected,
    isSearchHighlighted,
    containerKindLabel,
    childCount,
    onToggleCollapse,
  } = data;

  return (
    <div
      className={[
        'wf-container',
        isCollapsed ? 'wf-container--collapsed' : 'wf-container--expanded',
        isSelected ? 'wf-container--selected' : '',
        isSearchHighlighted ? 'wf-container--highlighted' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ '--node-accent': meta.categoryColor } as React.CSSProperties}
    >
      <Handle type="target" position={Position.Top} className="wf-handle" />

      <div className="wf-container-header">
        <div className="wf-container-header-left">
          <div
            className="wf-container-icon"
            style={{
              backgroundColor: `${meta.categoryColor}1f`,
              color: meta.categoryColor,
            }}
          >
            <ActionIcon name={meta.iconName} size={16} />
          </div>
          <div className="wf-container-titles">
            <div className="wf-container-title-row">
              <span className="wf-container-title" title={meta.key}>
                {meta.label}
              </span>
              <span
                className="wf-container-kind-pill"
                style={{
                  color: meta.categoryColor,
                  backgroundColor: `${meta.categoryColor}16`,
                }}
              >
                {containerKindLabel}
              </span>
            </div>
            {!isCollapsed && meta.normalizedType === 'foreach' && (
              <div className="wf-container-sub" title={meta.subtitle}>
                {meta.subtitle}
              </div>
            )}
          </div>
        </div>

        <div className="wf-container-actions">
          <span className="wf-container-count" title={`${childCount} nested actions`}>
            {childCount} {childCount === 1 ? 'step' : 'steps'}
          </span>
          <button
            type="button"
            className="wf-collapse-btn nodrag nopan"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse(id);
            }}
            aria-label={isCollapsed ? `Expand ${meta.label}` : `Collapse ${meta.label}`}
            title={isCollapsed ? 'Expand container' : 'Collapse container'}
          >
            {isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>
      </div>

      {isCollapsed ? (
        <div className="wf-container-collapsed-footer">
          {childCount === 0
            ? 'Empty container'
            : `${childCount} nested action${childCount === 1 ? '' : 's'} hidden · Click chevron to expand`}
        </div>
      ) : (
        childCount === 0 &&
        meta.normalizedType !== 'if' &&
        meta.normalizedType !== 'switch' && (
          <div className="wf-container-empty">No actions inside container</div>
        )
      )}

      <Handle type="source" position={Position.Bottom} className="wf-handle" />
    </div>
  );
}
