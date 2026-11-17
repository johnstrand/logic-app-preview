import type { Edge, Node } from '@xyflow/react';

export type RunAfterStatus = 'Succeeded' | 'Failed' | 'Skipped' | 'TimedOut' | string;

export interface RawTrigger {
  type: string;
  kind?: string;
  inputs?: Record<string, unknown>;
  recurrence?: Record<string, unknown>;
  conditions?: unknown[];
  runtimeConfiguration?: Record<string, unknown>;
  splitOn?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SwitchCaseDefinition {
  case?: unknown;
  actions?: Record<string, RawAction>;
  [key: string]: unknown;
}

export interface RawAction {
  type: string;
  kind?: string;
  runAfter?: Record<string, RunAfterStatus[]>;
  inputs?: Record<string, unknown> | unknown;
  expression?: unknown;
  foreach?: string;
  actions?: Record<string, RawAction>;
  else?: {
    actions?: Record<string, RawAction>;
  };
  cases?: Record<string, SwitchCaseDefinition>;
  default?: {
    actions?: Record<string, RawAction>;
  };
  limit?: Record<string, unknown>;
  timeout?: string;
  retryPolicy?: Record<string, unknown>;
  runtimeConfiguration?: Record<string, unknown>;
  trackedProperties?: Record<string, unknown>;
  operationOptions?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface WorkflowDefinition {
  $schema?: string;
  contentVersion?: string;
  parameters?: Record<string, unknown>;
  triggers: Record<string, RawTrigger>;
  actions: Record<string, RawAction>;
  outputs?: Record<string, unknown>;
}

export type DetectedFormat =
  | 'standard'
  | 'wdl-definition'
  | 'arm-resource'
  | 'arm-template';

export interface ParsedWorkflow {
  definition: WorkflowDefinition;
  kind?: string;
  format: DetectedFormat;
  workflowName?: string;
  warnings: string[];
}

export interface ParseError {
  message: string;
  line?: number;
  column?: number;
  isEmpty?: boolean;
}

export type ParseResult =
  | { ok: true; data: ParsedWorkflow }
  | { ok: false; error: ParseError };

export type NodeIconName =
  | 'webhook'
  | 'clock'
  | 'globe'
  | 'send'
  | 'plug'
  | 'cloud'
  | 'code'
  | 'variable'
  | 'workflow'
  | 'terminal'
  | 'terminate'
  | 'layers'
  | 'split'
  | 'route'
  | 'repeat'
  | 'rotate'
  | 'box';

export type WorkflowNodeKind = 'trigger' | 'action' | 'container';

export interface WorkflowNodeMeta {
  id: string;
  key: string;
  label: string;
  nodeKind: WorkflowNodeKind;
  actionType: string;
  normalizedType: string;
  subtitle: string;
  categoryColor: string;
  iconName: NodeIconName;
  breadcrumb: string[];
  ancestorContainerIds: string[];
  raw: RawTrigger | RawAction;
  childCount?: number;
  isTrigger: boolean;
  runAfter?: Record<string, RunAfterStatus[]>;
}

export interface ActionNodeData extends Record<string, unknown> {
  meta: WorkflowNodeMeta;
  isSelected: boolean;
  isSearchHighlighted: boolean;
}

export interface ContainerNodeData extends Record<string, unknown> {
  meta: WorkflowNodeMeta;
  isCollapsed: boolean;
  isSelected: boolean;
  isSearchHighlighted: boolean;
  containerKindLabel: string;
  childCount: number;
  onToggleCollapse: (containerId: string) => void;
}

export type BranchLaneVariant = 'true' | 'false' | 'case' | 'default';

export interface BranchLaneNodeData extends Record<string, unknown> {
  label: string;
  subtitle?: string;
  variant: BranchLaneVariant;
  isEmpty: boolean;
  childCount: number;
}

export interface RunAfterEdgeData extends Record<string, unknown> {
  statuses: RunAfterStatus[];
  sourceKey: string;
  targetKey: string;
  theme?: 'light' | 'dark';
}

export type WorkflowFlowNode = Node<ActionNodeData, 'workflowNode'>;
export type ContainerFlowNode = Node<ContainerNodeData, 'containerNode'>;
export type BranchLaneFlowNode = Node<BranchLaneNodeData, 'branchLane'>;

export type AppNode = WorkflowFlowNode | ContainerFlowNode | BranchLaneFlowNode;
export type AppEdge = Edge<RunAfterEdgeData, 'runAfter'>;

export interface WorkflowGraphResult {
  nodes: AppNode[];
  edges: AppEdge[];
  nodeIndex: Map<string, WorkflowNodeMeta>;
  containerIds: string[];
}
