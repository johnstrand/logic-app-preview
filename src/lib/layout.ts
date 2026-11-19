import dagre from '@dagrejs/dagre';
import {
  formatActionKey,
  getContainerKindLabel,
  isContainerActionType,
  resolveNodeVisuals,
} from './actionMeta';
import type {
  AppEdge,
  AppNode,
  BranchLaneFlowNode,
  BranchLaneVariant,
  ContainerFlowNode,
  ParsedWorkflow,
  RawAction,
  RawTrigger,
  RunAfterStatus,
  WorkflowFlowNode,
  WorkflowGraphResult,
  WorkflowNodeMeta,
} from '../types/workflow';

export const LAYOUT_CONSTANTS = {
  LEAF_WIDTH: 272,
  LEAF_HEIGHT: 76,
  COLLAPSED_WIDTH: 288,
  COLLAPSED_HEIGHT: 86,
  CONTAINER_HEADER_H: 54,
  CONTAINER_PAD_X: 24,
  CONTAINER_PAD_TOP: 24,
  CONTAINER_PAD_BOTTOM: 24,
  MIN_CONTAINER_W: 308,
  EMPTY_SCOPE_W: 244,
  EMPTY_SCOPE_H: 64,
  LANE_HEADER_H: 36,
  LANE_PAD_X: 18,
  LANE_PAD_TOP: 18,
  LANE_PAD_BOTTOM: 18,
  LANE_GAP: 24,
  MIN_LANE_W: 280,
  MIN_LANE_INNER_H: 64,
} as const;

export interface BuildGraphOptions {
  searchHighlightedId?: string | null;
  onToggleCollapse?: (containerId: string) => void;
}

interface SubScopeResult {
  nodes: AppNode[];
  edges: AppEdge[];
  width: number;
  height: number;
}

interface PendingScopeItem {
  id: string;
  key: string;
  width: number;
  height: number;
  node: AppNode;
  subNodes?: AppNode[];
  subEdges?: AppEdge[];
}

function isPlainRecord(value: unknown): value is Record<string, RawAction> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function countContainedActions(action: RawAction): number {
  let count = 0;
  const countMap = (map: Record<string, RawAction> | undefined) => {
    if (!isPlainRecord(map)) return;
    for (const child of Object.values(map)) {
      if (!child || typeof child !== 'object') continue;
      count += 1;
      count += countContainedActions(child);
    }
  };

  countMap(action.actions);
  countMap(action.else?.actions);
  if (action.cases && typeof action.cases === 'object') {
    for (const c of Object.values(action.cases)) {
      countMap(c?.actions);
    }
  }
  countMap(action.default?.actions);
  return count;
}

function buildActionMeta(
  id: string,
  key: string,
  raw: RawTrigger | RawAction,
  isTrigger: boolean,
  breadcrumb: string[],
  ancestorContainerIds: string[],
): WorkflowNodeMeta {
  const visuals = resolveNodeVisuals(raw, isTrigger);
  const isContainer = !isTrigger && isContainerActionType(raw.type);
  const childCount = isContainer ? countContainedActions(raw as RawAction) : undefined;

  return {
    id,
    key,
    label: formatActionKey(key),
    nodeKind: isTrigger ? 'trigger' : isContainer ? 'container' : 'action',
    actionType: typeof raw.type === 'string' ? raw.type : 'Unknown',
    normalizedType: visuals.normalizedType,
    subtitle: visuals.subtitle,
    categoryColor: visuals.categoryColor,
    iconName: visuals.iconName,
    breadcrumb,
    ancestorContainerIds,
    raw,
    childCount,
    isTrigger,
    runAfter: !isTrigger ? (raw as RawAction).runAfter : undefined,
  };
}

function indexCollapsedActionTree(
  actionsMap: Record<string, RawAction> | undefined,
  scopePath: string[],
  breadcrumb: string[],
  ancestorContainerIds: string[],
  nodeIndex: Map<string, WorkflowNodeMeta>,
  containerIds: string[],
): void {
  if (!isPlainRecord(actionsMap)) return;

  for (const [key, raw] of Object.entries(actionsMap)) {
    if (!raw || typeof raw !== 'object') continue;
    const nextPath = [...scopePath, key];
    const id = `action:${nextPath.join('/')}`;
    const meta = buildActionMeta(id, key, raw, false, breadcrumb, ancestorContainerIds);
    nodeIndex.set(id, meta);

    if (meta.nodeKind === 'container') {
      containerIds.push(id);
      const nextAncestors = [...ancestorContainerIds, id];
      const normalized = meta.normalizedType;

      if (normalized === 'if') {
        indexCollapsedActionTree(
          raw.actions,
          [...nextPath, 'True'],
          [...breadcrumb, `${key} (True)`],
          nextAncestors,
          nodeIndex,
          containerIds,
        );
        indexCollapsedActionTree(
          raw.else?.actions,
          [...nextPath, 'False'],
          [...breadcrumb, `${key} (False)`],
          nextAncestors,
          nodeIndex,
          containerIds,
        );
      } else if (normalized === 'switch') {
        if (raw.cases && typeof raw.cases === 'object') {
          for (const [caseKey, caseDef] of Object.entries(raw.cases)) {
            indexCollapsedActionTree(
              caseDef?.actions,
              [...nextPath, `case:${caseKey}`],
              [...breadcrumb, `${key} (${caseKey})`],
              nextAncestors,
              nodeIndex,
              containerIds,
            );
          }
        }
        indexCollapsedActionTree(
          raw.default?.actions,
          [...nextPath, 'default'],
          [...breadcrumb, `${key} (Default)`],
          nextAncestors,
          nodeIndex,
          containerIds,
        );
      } else {
        indexCollapsedActionTree(
          raw.actions,
          nextPath,
          [...breadcrumb, key],
          nextAncestors,
          nodeIndex,
          containerIds,
        );
      }
    }
  }
}

function reparentImmediateChildren(
  subNodes: AppNode[],
  parentId: string,
  offsetX: number,
  offsetY: number,
): AppNode[] {
  return subNodes.map((node) => {
    if (node.parentId) {
      return node;
    }
    return {
      ...node,
      parentId,
      position: {
        x: node.position.x + offsetX,
        y: node.position.y + offsetY,
      },
    };
  });
}

export function buildWorkflowGraph(
  parsed: ParsedWorkflow,
  collapsedIds: ReadonlySet<string>,
  selectedNodeId: string | null,
  options: BuildGraphOptions = {},
): WorkflowGraphResult {
  const { searchHighlightedId = null, onToggleCollapse = () => {} } = options;
  const nodeIndex = new Map<string, WorkflowNodeMeta>();
  const containerIds: string[] = [];

  const triggers = parsed.definition.triggers ?? {};
  const rootActions = parsed.definition.actions ?? {};

  const layoutScope = (
    actionsMap: Record<string, RawAction>,
    scopePath: string[],
    depth: number,
    breadcrumb: string[],
    ancestorContainerIds: string[],
    rootTriggers?: Record<string, RawTrigger>,
  ): SubScopeResult => {
    const items: PendingScopeItem[] = [];
    const triggerKeyToId = new Map<string, string>();
    const actionKeyToId = new Map<string, string>();

    if (rootTriggers) {
      for (const [tKey, tRaw] of Object.entries(rootTriggers)) {
        if (!tRaw || typeof tRaw !== 'object') continue;
        const tId = `trigger:${tKey}`;
        triggerKeyToId.set(tKey, tId);

        const meta = buildActionMeta(tId, tKey, tRaw, true, breadcrumb, ancestorContainerIds);
        nodeIndex.set(tId, meta);

        const flowNode: WorkflowFlowNode = {
          id: tId,
          type: 'workflowNode',
          position: { x: 0, y: 0 },
          width: LAYOUT_CONSTANTS.LEAF_WIDTH,
          height: LAYOUT_CONSTANTS.LEAF_HEIGHT,
          style: {
            width: LAYOUT_CONSTANTS.LEAF_WIDTH,
            height: LAYOUT_CONSTANTS.LEAF_HEIGHT,
          },
          zIndex: depth * 10 + 6,
          draggable: false,
          selectable: true,
          selected: selectedNodeId === tId,
          data: {
            meta,
            isSelected: selectedNodeId === tId,
            isSearchHighlighted: searchHighlightedId === tId,
          },
        };

        items.push({
          id: tId,
          key: tKey,
          width: LAYOUT_CONSTANTS.LEAF_WIDTH,
          height: LAYOUT_CONSTANTS.LEAF_HEIGHT,
          node: flowNode,
        });
      }
    }

    for (const [aKey, aRaw] of Object.entries(actionsMap)) {
      if (!aRaw || typeof aRaw !== 'object') continue;
      const nextPath = [...scopePath, aKey];
      const aId = `action:${nextPath.join('/')}`;
      actionKeyToId.set(aKey, aId);

      const meta = buildActionMeta(aId, aKey, aRaw, false, breadcrumb, ancestorContainerIds);
      nodeIndex.set(aId, meta);

      if (meta.nodeKind === 'container') {
        containerIds.push(aId);
        const isCollapsed = collapsedIds.has(aId);
        const nextAncestors = [...ancestorContainerIds, aId];
        const normalized = meta.normalizedType;
        const containerKindLabel = getContainerKindLabel(normalized);
        const childCount = meta.childCount ?? 0;

        if (isCollapsed) {
          // Index descendants so global search can still find and expand into them
          if (normalized === 'if') {
            indexCollapsedActionTree(
              aRaw.actions,
              [...nextPath, 'True'],
              [...breadcrumb, `${aKey} (True)`],
              nextAncestors,
              nodeIndex,
              containerIds,
            );
            indexCollapsedActionTree(
              aRaw.else?.actions,
              [...nextPath, 'False'],
              [...breadcrumb, `${aKey} (False)`],
              nextAncestors,
              nodeIndex,
              containerIds,
            );
          } else if (normalized === 'switch') {
            if (aRaw.cases && typeof aRaw.cases === 'object') {
              for (const [caseKey, caseDef] of Object.entries(aRaw.cases)) {
                indexCollapsedActionTree(
                  caseDef?.actions,
                  [...nextPath, `case:${caseKey}`],
                  [...breadcrumb, `${aKey} (${caseKey})`],
                  nextAncestors,
                  nodeIndex,
                  containerIds,
                );
              }
            }
            indexCollapsedActionTree(
              aRaw.default?.actions,
              [...nextPath, 'default'],
              [...breadcrumb, `${aKey} (Default)`],
              nextAncestors,
              nodeIndex,
              containerIds,
            );
          } else {
            indexCollapsedActionTree(
              aRaw.actions,
              nextPath,
              [...breadcrumb, aKey],
              nextAncestors,
              nodeIndex,
              containerIds,
            );
          }

          const collapsedNode: ContainerFlowNode = {
            id: aId,
            type: 'containerNode',
            position: { x: 0, y: 0 },
            width: LAYOUT_CONSTANTS.COLLAPSED_WIDTH,
            height: LAYOUT_CONSTANTS.COLLAPSED_HEIGHT,
            style: {
              width: LAYOUT_CONSTANTS.COLLAPSED_WIDTH,
              height: LAYOUT_CONSTANTS.COLLAPSED_HEIGHT,
            },
            zIndex: depth * 10 + 1,
            draggable: false,
            selectable: true,
            selected: selectedNodeId === aId,
            data: {
              meta,
              isCollapsed: true,
              isSelected: selectedNodeId === aId,
              isSearchHighlighted: searchHighlightedId === aId,
              containerKindLabel,
              childCount,
              onToggleCollapse,
            },
          };

          items.push({
            id: aId,
            key: aKey,
            width: LAYOUT_CONSTANTS.COLLAPSED_WIDTH,
            height: LAYOUT_CONSTANTS.COLLAPSED_HEIGHT,
            node: collapsedNode,
          });
        } else if (normalized === 'if' || normalized === 'switch') {
          interface LaneSpec {
            laneKey: string;
            label: string;
            subtitle?: string;
            variant: BranchLaneVariant;
            actions: Record<string, RawAction>;
            subPath: string[];
            subBreadcrumb: string[];
          }

          const laneSpecs: LaneSpec[] = [];
          if (normalized === 'if') {
            laneSpecs.push({
              laneKey: 'True',
              label: 'True',
              variant: 'true',
              actions: isPlainRecord(aRaw.actions) ? aRaw.actions : {},
              subPath: [...nextPath, 'True'],
              subBreadcrumb: [...breadcrumb, `${aKey} (True)`],
            });
            laneSpecs.push({
              laneKey: 'False',
              label: 'False',
              variant: 'false',
              actions: isPlainRecord(aRaw.else?.actions) ? aRaw.else!.actions! : {},
              subPath: [...nextPath, 'False'],
              subBreadcrumb: [...breadcrumb, `${aKey} (False)`],
            });
          } else {
            const caseEntries =
              aRaw.cases && typeof aRaw.cases === 'object' ? Object.entries(aRaw.cases) : [];
            for (const [caseKey, caseDef] of caseEntries) {
              const caseVal =
                caseDef && caseDef.case !== undefined ? `= ${String(caseDef.case)}` : undefined;
              laneSpecs.push({
                laneKey: `case:${caseKey}`,
                label: caseKey,
                subtitle: caseVal,
                variant: 'case',
                actions: isPlainRecord(caseDef?.actions) ? caseDef.actions : {},
                subPath: [...nextPath, `case:${caseKey}`],
                subBreadcrumb: [...breadcrumb, `${aKey} (${caseKey})`],
              });
            }
            laneSpecs.push({
              laneKey: 'default',
              label: 'Default',
              variant: 'default',
              actions: isPlainRecord(aRaw.default?.actions) ? aRaw.default!.actions! : {},
              subPath: [...nextPath, 'default'],
              subBreadcrumb: [...breadcrumb, `${aKey} (Default)`],
            });
          }

          const measuredLanes = laneSpecs.map((spec) => {
            const sub = layoutScope(
              spec.actions,
              spec.subPath,
              depth + 2,
              spec.subBreadcrumb,
              nextAncestors,
            );
            const laneW = Math.max(
              LAYOUT_CONSTANTS.MIN_LANE_W,
              sub.width + LAYOUT_CONSTANTS.LANE_PAD_X * 2,
            );
            const laneH =
              LAYOUT_CONSTANTS.LANE_HEADER_H +
              LAYOUT_CONSTANTS.LANE_PAD_TOP +
              Math.max(LAYOUT_CONSTANTS.MIN_LANE_INNER_H, sub.height) +
              LAYOUT_CONSTANTS.LANE_PAD_BOTTOM;
            return {
              spec,
              sub,
              laneW,
              laneH,
              actionCount: Object.keys(spec.actions).length,
            };
          });

          const maxLaneH = measuredLanes.reduce((acc, l) => Math.max(acc, l.laneH), 0);
          const totalLanesW =
            measuredLanes.reduce((acc, l) => acc + l.laneW, 0) +
            Math.max(0, measuredLanes.length - 1) * LAYOUT_CONSTANTS.LANE_GAP;

          const containerW = Math.max(
            LAYOUT_CONSTANTS.MIN_CONTAINER_W,
            totalLanesW + LAYOUT_CONSTANTS.CONTAINER_PAD_X * 2,
          );
          const containerH =
            LAYOUT_CONSTANTS.CONTAINER_HEADER_H +
            LAYOUT_CONSTANTS.CONTAINER_PAD_TOP +
            maxLaneH +
            LAYOUT_CONSTANTS.CONTAINER_PAD_BOTTOM;

          const containerNode: ContainerFlowNode = {
            id: aId,
            type: 'containerNode',
            position: { x: 0, y: 0 },
            width: containerW,
            height: containerH,
            style: {
              width: containerW,
              height: containerH,
            },
            zIndex: depth * 10 + 1,
            draggable: false,
            selectable: true,
            selected: selectedNodeId === aId,
            data: {
              meta,
              isCollapsed: false,
              isSelected: selectedNodeId === aId,
              isSearchHighlighted: searchHighlightedId === aId,
              containerKindLabel,
              childCount,
              onToggleCollapse,
            },
          };

          const nestedNodes: AppNode[] = [];
          const nestedEdges: AppEdge[] = [];
          let cursorX = (containerW - totalLanesW) / 2;

          for (const lane of measuredLanes) {
            const laneId = `lane:${[...nextPath, lane.spec.laneKey].join('/')}`;
            const laneNode: BranchLaneFlowNode = {
              id: laneId,
              type: 'branchLane',
              parentId: aId,
              position: {
                x: cursorX,
                y: LAYOUT_CONSTANTS.CONTAINER_HEADER_H + LAYOUT_CONSTANTS.CONTAINER_PAD_TOP,
              },
              width: lane.laneW,
              height: maxLaneH,
              style: {
                width: lane.laneW,
                height: maxLaneH,
                pointerEvents: 'none',
              },
              zIndex: (depth + 1) * 10 + 1,
              draggable: false,
              selectable: false,
              focusable: false,
              data: {
                label: lane.spec.label,
                subtitle: lane.spec.subtitle,
                variant: lane.spec.variant,
                isEmpty: lane.actionCount === 0,
                childCount: lane.actionCount,
              },
            };

            const childOffsetX = (lane.laneW - lane.sub.width) / 2;
            const childOffsetY = LAYOUT_CONSTANTS.LANE_HEADER_H + LAYOUT_CONSTANTS.LANE_PAD_TOP;
            const shiftedLaneChildren = reparentImmediateChildren(
              lane.sub.nodes,
              laneId,
              childOffsetX,
              childOffsetY,
            );

            // Emit lane node strictly before its child nodes
            nestedNodes.push(laneNode, ...shiftedLaneChildren);
            nestedEdges.push(...lane.sub.edges);

            cursorX += lane.laneW + LAYOUT_CONSTANTS.LANE_GAP;
          }

          items.push({
            id: aId,
            key: aKey,
            width: containerW,
            height: containerH,
            node: containerNode,
            subNodes: nestedNodes,
            subEdges: nestedEdges,
          });
        } else {
          // Scope, Foreach, Until
          const childActions = isPlainRecord(aRaw.actions) ? aRaw.actions : {};
          const sub = layoutScope(
            childActions,
            nextPath,
            depth + 1,
            [...breadcrumb, aKey],
            nextAncestors,
          );

          const containerW = Math.max(
            LAYOUT_CONSTANTS.MIN_CONTAINER_W,
            sub.width + LAYOUT_CONSTANTS.CONTAINER_PAD_X * 2,
          );
          const containerH =
            LAYOUT_CONSTANTS.CONTAINER_HEADER_H +
            LAYOUT_CONSTANTS.CONTAINER_PAD_TOP +
            Math.max(LAYOUT_CONSTANTS.EMPTY_SCOPE_H, sub.height) +
            LAYOUT_CONSTANTS.CONTAINER_PAD_BOTTOM;

          const containerNode: ContainerFlowNode = {
            id: aId,
            type: 'containerNode',
            position: { x: 0, y: 0 },
            width: containerW,
            height: containerH,
            style: {
              width: containerW,
              height: containerH,
            },
            zIndex: depth * 10 + 1,
            draggable: false,
            selectable: true,
            selected: selectedNodeId === aId,
            data: {
              meta,
              isCollapsed: false,
              isSelected: selectedNodeId === aId,
              isSearchHighlighted: searchHighlightedId === aId,
              containerKindLabel,
              childCount,
              onToggleCollapse,
            },
          };

          const childOffsetX = (containerW - sub.width) / 2;
          const childOffsetY =
            LAYOUT_CONSTANTS.CONTAINER_HEADER_H + LAYOUT_CONSTANTS.CONTAINER_PAD_TOP;
          const shiftedChildren = reparentImmediateChildren(
            sub.nodes,
            aId,
            childOffsetX,
            childOffsetY,
          );

          items.push({
            id: aId,
            key: aKey,
            width: containerW,
            height: containerH,
            node: containerNode,
            subNodes: shiftedChildren,
            subEdges: sub.edges,
          });
        }
      } else {
        const flowNode: WorkflowFlowNode = {
          id: aId,
          type: 'workflowNode',
          position: { x: 0, y: 0 },
          width: LAYOUT_CONSTANTS.LEAF_WIDTH,
          height: LAYOUT_CONSTANTS.LEAF_HEIGHT,
          style: {
            width: LAYOUT_CONSTANTS.LEAF_WIDTH,
            height: LAYOUT_CONSTANTS.LEAF_HEIGHT,
          },
          zIndex: depth * 10 + 6,
          draggable: false,
          selectable: true,
          selected: selectedNodeId === aId,
          data: {
            meta,
            isSelected: selectedNodeId === aId,
            isSearchHighlighted: searchHighlightedId === aId,
          },
        };

        items.push({
          id: aId,
          key: aKey,
          width: LAYOUT_CONSTANTS.LEAF_WIDTH,
          height: LAYOUT_CONSTANTS.LEAF_HEIGHT,
          node: flowNode,
        });
      }
    }

    if (items.length === 0) {
      return {
        nodes: [],
        edges: [],
        width: LAYOUT_CONSTANTS.EMPTY_SCOPE_W,
        height: LAYOUT_CONSTANTS.EMPTY_SCOPE_H,
      };
    }

    // Build edges within this scope
    const scopeEdges: AppEdge[] = [];
    const rootTriggerEntries = rootTriggers ? Array.from(triggerKeyToId.entries()) : [];

    for (const [aKey, aRaw] of Object.entries(actionsMap)) {
      if (!aRaw || typeof aRaw !== 'object') continue;
      const targetId = actionKeyToId.get(aKey);
      if (!targetId) continue;

      const runAfterObj =
        aRaw.runAfter && typeof aRaw.runAfter === 'object' && !Array.isArray(aRaw.runAfter)
          ? aRaw.runAfter
          : {};
      const runAfterEntries = Object.entries(runAfterObj);

      if (runAfterEntries.length > 0) {
        for (const [depKey, rawStatuses] of runAfterEntries) {
          const sourceId = actionKeyToId.get(depKey) ?? triggerKeyToId.get(depKey);
          if (!sourceId || sourceId === targetId) continue;
          const statuses: RunAfterStatus[] =
            Array.isArray(rawStatuses) && rawStatuses.length > 0
              ? rawStatuses.map(String)
              : ['Succeeded'];
          scopeEdges.push({
            id: `edge:${sourceId}->${targetId}`,
            source: sourceId,
            target: targetId,
            type: 'runAfter',
            zIndex: depth * 10 + 5,
            data: {
              statuses,
              sourceKey: depKey,
              targetKey: aKey,
            },
          });
        }
      } else if (depth === 0 && rootTriggerEntries.length > 0) {
        for (const [tKey, tId] of rootTriggerEntries) {
          scopeEdges.push({
            id: `edge:${tId}->${targetId}`,
            source: tId,
            target: targetId,
            type: 'runAfter',
            zIndex: depth * 10 + 5,
            data: {
              statuses: ['Succeeded'],
              sourceKey: tKey,
              targetKey: aKey,
            },
          });
        }
      }
    }

    // Layout with Dagre
    const g = new dagre.graphlib.Graph();
    g.setGraph({
      rankdir: 'TB',
      nodesep: 48,
      ranksep: 64,
      marginx: 0,
      marginy: 0,
    });
    g.setDefaultEdgeLabel(() => ({}));

    for (const item of items) {
      g.setNode(item.id, { width: item.width, height: item.height });
    }
    for (const edge of scopeEdges) {
      if (!g.hasEdge(edge.source, edge.target)) {
        g.setEdge(edge.source, edge.target);
      }
    }

    dagre.layout(g);

    // Convert Dagre center coordinates -> top-left & normalize to (0, 0)
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const topLeftMap = new Map<string, { x: number; y: number }>();
    for (const item of items) {
      const laidOut = g.node(item.id);
      const tlX = laidOut.x - item.width / 2;
      const tlY = laidOut.y - item.height / 2;
      topLeftMap.set(item.id, { x: tlX, y: tlY });
      minX = Math.min(minX, tlX);
      minY = Math.min(minY, tlY);
      maxX = Math.max(maxX, tlX + item.width);
      maxY = Math.max(maxY, tlY + item.height);
    }

    if (!Number.isFinite(minX)) minX = 0;
    if (!Number.isFinite(minY)) minY = 0;
    if (!Number.isFinite(maxX)) maxX = LAYOUT_CONSTANTS.EMPTY_SCOPE_W;
    if (!Number.isFinite(maxY)) maxY = LAYOUT_CONSTANTS.EMPTY_SCOPE_H;

    const resultNodes: AppNode[] = [];
    const resultEdges: AppEdge[] = [...scopeEdges];

    for (const item of items) {
      const pos = topLeftMap.get(item.id) ?? { x: 0, y: 0 };
      const positionedNode: AppNode = {
        ...item.node,
        position: {
          x: Math.round(pos.x - minX),
          y: Math.round(pos.y - minY),
        },
      };

      // Emit parent strictly before any descendants
      resultNodes.push(positionedNode);
      if (item.subNodes && item.subNodes.length > 0) {
        resultNodes.push(...item.subNodes);
      }
      if (item.subEdges && item.subEdges.length > 0) {
        resultEdges.push(...item.subEdges);
      }
    }

    return {
      nodes: resultNodes,
      edges: resultEdges,
      width: Math.max(1, Math.round(maxX - minX)),
      height: Math.max(1, Math.round(maxY - minY)),
    };
  };

  const root = layoutScope(rootActions, [], 0, [], [], triggers);

  return {
    nodes: root.nodes,
    edges: root.edges,
    nodeIndex,
    containerIds,
  };
}
