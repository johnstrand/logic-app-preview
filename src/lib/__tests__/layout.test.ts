import { describe, expect, it } from 'vitest';
import { WORKFLOW_SAMPLES } from '../../data/samples';
import type { AppNode } from '../../types/workflow';
import { buildWorkflowGraph, LAYOUT_CONSTANTS } from '../layout';
import { parseWorkflowJson } from '../parser';

function assertGraphInvariants(graph: ReturnType<typeof buildWorkflowGraph>) {
  const indexById = new Map<string, number>();
  graph.nodes.forEach((n, idx) => indexById.set(n.id, idx));
  const childrenByParent = new Map<string, AppNode[]>();

  // Every parent must precede its children and all positions/sizes must be finite
  for (let i = 0; i < graph.nodes.length; i++) {
    const node = graph.nodes[i];
    expect(Number.isFinite(node.position.x)).toBe(true);
    expect(Number.isFinite(node.position.y)).toBe(true);
    expect(node.width).toBeGreaterThan(0);
    expect(node.height).toBeGreaterThan(0);

    if (node.parentId) {
      const parentIdx = indexById.get(node.parentId);
      expect(parentIdx).toBeDefined();
      expect(parentIdx!).toBeLessThan(i);

      const list = childrenByParent.get(node.parentId);
      if (list) {
        list.push(node);
      } else {
        childrenByParent.set(node.parentId, [node]);
      }
    }
  }

  // Every edge source & target must exist in nodes, and edge zIndex > parent container zIndex
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

  for (const [parentId, children] of childrenByParent.entries()) {
    const parent = nodeById.get(parentId)!;
    const minY = Math.min(...children.map((c) => c.position.y));

    if (parent.type === 'containerNode') {
      expect(minY).toBe(
        LAYOUT_CONSTANTS.CONTAINER_HEADER_H + LAYOUT_CONSTANTS.CONTAINER_PAD_TOP,
      );
      for (const child of children) {
        expect(parent.height! - (child.position.y + child.height!)).toBeGreaterThanOrEqual(
          LAYOUT_CONSTANTS.CONTAINER_PAD_BOTTOM,
        );
        expect(child.position.x).toBeGreaterThanOrEqual(LAYOUT_CONSTANTS.CONTAINER_PAD_X);
        expect(parent.width! - (child.position.x + child.width!)).toBeGreaterThanOrEqual(
          LAYOUT_CONSTANTS.CONTAINER_PAD_X,
        );
      }
    } else if (parent.type === 'branchLane') {
      expect(minY).toBe(LAYOUT_CONSTANTS.LANE_HEADER_H + LAYOUT_CONSTANTS.LANE_PAD_TOP);
      for (const child of children) {
        expect(parent.height! - (child.position.y + child.height!)).toBeGreaterThanOrEqual(
          LAYOUT_CONSTANTS.LANE_PAD_BOTTOM,
        );
        expect(child.position.x).toBeGreaterThanOrEqual(LAYOUT_CONSTANTS.LANE_PAD_X);
        expect(parent.width! - (child.position.x + child.width!)).toBeGreaterThanOrEqual(
          LAYOUT_CONSTANTS.LANE_PAD_X,
        );
      }
    }
  }

  for (const edge of graph.edges) {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    expect(source).toBeDefined();
    expect(target).toBeDefined();

    if (source?.parentId) {
      const parent = nodeById.get(source.parentId);
      expect(parent).toBeDefined();
      expect(edge.zIndex ?? 0).toBeGreaterThan(parent!.zIndex ?? 0);
    }
  }
}

describe('buildWorkflowGraph', () => {
  it('lays out all sample workflows with valid parent-before-child ordering and finite coordinates', () => {
    for (const sample of WORKFLOW_SAMPLES) {
      const parsed = parseWorkflowJson(sample.json);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) continue;

      const graph = buildWorkflowGraph(parsed.data, new Set(), null);
      expect(graph.nodes.length).toBeGreaterThan(0);
      expect(graph.edges.length).toBeGreaterThan(0);
      assertGraphInvariants(graph);
    }
  });

  it('wires trigger nodes to root actions with empty runAfter', () => {
    const parsed = parseWorkflowJson(WORKFLOW_SAMPLES[0].json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const graph = buildWorkflowGraph(parsed.data, new Set(), null);
    const triggerEdge = graph.edges.find(
      (e) =>
        e.source === 'trigger:When_an_order_HTTP_request_is_received' &&
        e.target === 'action:Initialize_Order_Status',
    );
    expect(triggerEdge).toBeDefined();
    expect(triggerEdge?.data?.statuses).toEqual(['Succeeded']);
  });

  it('preserves runAfter failure and timeout statuses on edges', () => {
    const parsed = parseWorkflowJson(WORKFLOW_SAMPLES[2].json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const graph = buildWorkflowGraph(parsed.data, new Set(), null);
    const catchEdge = graph.edges.find(
      (e) =>
        e.source === 'action:Try_Sync_Customers' &&
        e.target === 'action:Catch_Sync_Failure',
    );
    expect(catchEdge?.data?.statuses).toEqual(['Failed', 'TimedOut']);
  });

  it('handles lowercase control-flow types (if, switch, foreach, scope, until)', () => {
    const json = JSON.stringify({
      definition: {
        triggers: { manual: { type: 'request' } },
        actions: {
          outer_scope: {
            type: 'scope',
            runAfter: {},
            actions: {
              branch_if: {
                type: 'if',
                runAfter: {},
                expression: true,
                actions: {
                  loop_until: {
                    type: 'until',
                    runAfter: {},
                    expression: '@equals(1,1)',
                    actions: {
                      step_a: { type: 'compose', inputs: 1, runAfter: {} },
                    },
                  },
                },
                else: {
                  actions: {},
                },
              },
            },
          },
        },
      },
      kind: 'Stateless',
    });

    const parsed = parseWorkflowJson(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const graph = buildWorkflowGraph(parsed.data, new Set(), null);
    assertGraphInvariants(graph);
    expect(graph.containerIds).toContain('action:outer_scope');
    expect(graph.containerIds).toContain('action:outer_scope/branch_if');
    expect(graph.containerIds).toContain('action:outer_scope/branch_if/True/loop_until');
    expect(
      graph.nodeIndex.get('action:outer_scope/branch_if/True/loop_until/step_a'),
    ).toBeDefined();
  });

  it('indexes collapsed descendants with ancestorContainerIds for search-to-expand', () => {
    const parsed = parseWorkflowJson(WORKFLOW_SAMPLES[0].json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const collapsed = new Set(['action:Validate_High_Value_Order']);
    const graph = buildWorkflowGraph(parsed.data, collapsed, null);
    assertGraphInvariants(graph);

    // Nested nodes are hidden from React Flow nodes array
    const hiddenNode = graph.nodes.find(
      (n) =>
        n.id ===
        'action:Validate_High_Value_Order/True/Route_Payment_Method/case:CreditCard/Authorize_Card_Gateway',
    );
    expect(hiddenNode).toBeUndefined();

    // But still searchable in nodeIndex with full ancestorContainerIds
    const meta = graph.nodeIndex.get(
      'action:Validate_High_Value_Order/True/Route_Payment_Method/case:CreditCard/Authorize_Card_Gateway',
    );
    expect(meta).toBeDefined();
    expect(meta?.ancestorContainerIds).toEqual([
      'action:Validate_High_Value_Order',
      'action:Validate_High_Value_Order/True/Route_Payment_Method',
    ]);
  });

  it('applies symmetric top and bottom padding inside Scope containers, If containers, and branch lanes', () => {
    const json = JSON.stringify({
      definition: {
        triggers: { manual: { type: 'Request' } },
        actions: {
          My_Scope: {
            type: 'Scope',
            runAfter: {},
            actions: {
              Scope_Step: { type: 'Compose', inputs: 'ok', runAfter: {} },
            },
          },
          My_Condition: {
            type: 'If',
            runAfter: { My_Scope: ['Succeeded'] },
            expression: { equals: [1, 1] },
            actions: {
              True_Step: { type: 'Compose', inputs: 'yes', runAfter: {} },
            },
            else: {
              actions: {
                False_Step: { type: 'Compose', inputs: 'no', runAfter: {} },
              },
            },
          },
        },
      },
      kind: 'Stateful',
    });

    const parsed = parseWorkflowJson(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const graph = buildWorkflowGraph(parsed.data, new Set(), null);
    assertGraphInvariants(graph);

    const byId = new Map(graph.nodes.map((n) => [n.id, n]));

    // Scope container & child
    const scope = byId.get('action:My_Scope')!;
    const scopeStep = byId.get('action:My_Scope/Scope_Step')!;
    expect(scopeStep.position.y).toBe(
      LAYOUT_CONSTANTS.CONTAINER_HEADER_H + LAYOUT_CONSTANTS.CONTAINER_PAD_TOP,
    );
    expect(scope.height! - (scopeStep.position.y + scopeStep.height!)).toBe(
      LAYOUT_CONSTANTS.CONTAINER_PAD_BOTTOM,
    );

    // If container, branch lanes, and nested lane actions
    const ifNode = byId.get('action:My_Condition')!;
    const trueLane = byId.get('lane:My_Condition/True')!;
    const falseLane = byId.get('lane:My_Condition/False')!;
    const trueStep = byId.get('action:My_Condition/True/True_Step')!;
    const falseStep = byId.get('action:My_Condition/False/False_Step')!;

    expect(trueLane.position.y).toBe(
      LAYOUT_CONSTANTS.CONTAINER_HEADER_H + LAYOUT_CONSTANTS.CONTAINER_PAD_TOP,
    );
    expect(falseLane.position.y).toBe(
      LAYOUT_CONSTANTS.CONTAINER_HEADER_H + LAYOUT_CONSTANTS.CONTAINER_PAD_TOP,
    );
    expect(ifNode.height! - (trueLane.position.y + trueLane.height!)).toBe(
      LAYOUT_CONSTANTS.CONTAINER_PAD_BOTTOM,
    );

    expect(trueStep.position.y).toBe(
      LAYOUT_CONSTANTS.LANE_HEADER_H + LAYOUT_CONSTANTS.LANE_PAD_TOP,
    );
    expect(trueLane.height! - (trueStep.position.y + trueStep.height!)).toBe(
      LAYOUT_CONSTANTS.LANE_PAD_BOTTOM,
    );
    expect(falseStep.position.y).toBe(
      LAYOUT_CONSTANTS.LANE_HEADER_H + LAYOUT_CONSTANTS.LANE_PAD_TOP,
    );
    expect(falseLane.height! - (falseStep.position.y + falseStep.height!)).toBe(
      LAYOUT_CONSTANTS.LANE_PAD_BOTTOM,
    );
  });
});
