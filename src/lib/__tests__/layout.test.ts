import { describe, expect, it } from 'vitest';
import { WORKFLOW_SAMPLES } from '../../data/samples';
import { buildWorkflowGraph } from '../layout';
import { parseWorkflowJson } from '../parser';

function assertGraphInvariants(graph: ReturnType<typeof buildWorkflowGraph>) {
  const indexById = new Map<string, number>();
  graph.nodes.forEach((n, idx) => indexById.set(n.id, idx));

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
    }
  }

  // Every edge source & target must exist in nodes, and edge zIndex > parent container zIndex
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
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
});
