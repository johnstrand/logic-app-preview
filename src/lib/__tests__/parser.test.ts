import { describe, expect, it } from 'vitest';
import { WORKFLOW_SAMPLES } from '../../data/samples';
import { parseWorkflowJson } from '../parser';

describe('parseWorkflowJson', () => {
  it('parses all built-in Logic App Standard workflow samples', () => {
    for (const sample of WORKFLOW_SAMPLES) {
      const result = parseWorkflowJson(sample.json);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.format).toBe('standard');
        expect(['Stateful', 'Stateless']).toContain(result.data.kind);
        expect(Object.keys(result.data.definition.triggers).length).toBeGreaterThan(0);
        expect(Object.keys(result.data.definition.actions).length).toBeGreaterThan(0);
      }
    }
  });

  it('auto-detects bare WDL definitions', () => {
    const bareWdl = JSON.stringify({
      $schema:
        'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',
      triggers: {
        manual: { type: 'Request', kind: 'Http' },
      },
      actions: {
        echo: { type: 'Compose', inputs: 'hello', runAfter: {} },
      },
    });

    const result = parseWorkflowJson(bareWdl);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.format).toBe('wdl-definition');
      expect(Object.keys(result.data.definition.triggers)).toEqual(['manual']);
      expect(Object.keys(result.data.definition.actions)).toEqual(['echo']);
    }
  });

  it('auto-detects single ARM workflow resources and ARM templates', () => {
    const armResource = JSON.stringify({
      type: 'Microsoft.Logic/workflows',
      name: 'my-consumption-app',
      properties: {
        definition: {
          triggers: { Recurrence: { type: 'Recurrence' } },
          actions: { Compose_1: { type: 'Compose', inputs: 42, runAfter: {} } },
        },
      },
    });
    const armTemplate = JSON.stringify({
      $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
      resources: [
        {
          type: 'Microsoft.Web/connections',
          name: 'unused-connection',
        },
        {
          type: 'Microsoft.Logic/workflows',
          name: 'template-workflow',
          properties: {
            definition: {
              triggers: { Manual: { type: 'Request' } },
              actions: { Reply: { type: 'Response', runAfter: {} } },
            },
          },
        },
      ],
    });

    const res1 = parseWorkflowJson(armResource);
    expect(res1.ok).toBe(true);
    if (res1.ok) {
      expect(res1.data.format).toBe('arm-resource');
      expect(res1.data.workflowName).toBe('my-consumption-app');
    }

    const res2 = parseWorkflowJson(armTemplate);
    expect(res2.ok).toBe(true);
    if (res2.ok) {
      expect(res2.data.format).toBe('arm-template');
      expect(res2.data.workflowName).toBe('template-workflow');
    }
  });

  it('returns empty flag for blank input', () => {
    const result = parseWorkflowJson('   \n  ');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.isEmpty).toBe(true);
    }
  });

  it('reports line and column on malformed JSON', () => {
    const badJson = '{\n  "definition": {\n    "triggers": \n  }\n}';
    const result = parseWorkflowJson(badJson);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.isEmpty).toBeFalsy();
      expect(result.error.line).toBeGreaterThanOrEqual(3);
      expect(result.error.column).toBeGreaterThanOrEqual(1);
    }
  });

  it('rejects valid JSON that is not a workflow definition', () => {
    const result = parseWorkflowJson('{"hello": "world"}');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('workflow definition');
    }
  });
});
