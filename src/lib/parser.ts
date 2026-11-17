import type {
  DetectedFormat,
  ParseResult,
  RawAction,
  RawTrigger,
  WorkflowDefinition,
} from '../types/workflow';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getLineColFromPosition(text: string, pos: number): { line: number; column: number } {
  const safePos = Math.max(0, Math.min(pos, text.length));
  const slice = text.slice(0, safePos);
  const lines = slice.split('\n');
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1,
  };
}

function locateJsonSyntaxError(text: string): { line: number; column: number } {
  let i = 0;
  const len = text.length;

  const skipWs = () => {
    while (i < len && (text[i] === ' ' || text[i] === '\t' || text[i] === '\n' || text[i] === '\r')) {
      i += 1;
    }
  };

  const failAt = (pos: number): never => {
    throw pos;
  };

  const parseString = () => {
    if (text[i] !== '"') failAt(i);
    i += 1;
    while (i < len) {
      const ch = text[i];
      const code = text.charCodeAt(i);
      if (ch === '"') {
        i += 1;
        return;
      }
      if (ch === '\\') {
        i += 1;
        if (i >= len) failAt(i);
        const esc = text[i];
        if (esc === 'u') {
          i += 1;
          for (let h = 0; h < 4; h += 1) {
            if (i >= len || !/[0-9a-fA-F]/.test(text[i])) failAt(i);
            i += 1;
          }
        } else if ('"\\/bfnrt'.includes(esc)) {
          i += 1;
        } else {
          failAt(i);
        }
      } else if (code < 0x20) {
        failAt(i);
      } else {
        i += 1;
      }
    }
    failAt(len);
  };

  const parseNumber = () => {
    const start = i;
    if (text[i] === '-') i += 1;
    if (i >= len) failAt(start);
    if (text[i] === '0') {
      i += 1;
      if (i < len && text[i] >= '0' && text[i] <= '9') failAt(i);
    } else if (text[i] >= '1' && text[i] <= '9') {
      while (i < len && text[i] >= '0' && text[i] <= '9') i += 1;
    } else {
      failAt(i);
    }
    if (i < len && text[i] === '.') {
      i += 1;
      if (i >= len || text[i] < '0' || text[i] > '9') failAt(i);
      while (i < len && text[i] >= '0' && text[i] <= '9') i += 1;
    }
    if (i < len && (text[i] === 'e' || text[i] === 'E')) {
      i += 1;
      if (i < len && (text[i] === '+' || text[i] === '-')) i += 1;
      if (i >= len || text[i] < '0' || text[i] > '9') failAt(i);
      while (i < len && text[i] >= '0' && text[i] <= '9') i += 1;
    }
  };

  const parseKeyword = (kw: string) => {
    for (let k = 0; k < kw.length; k += 1) {
      if (text[i] !== kw[k]) failAt(i);
      i += 1;
    }
  };

  const parseValue = () => {
    skipWs();
    if (i >= len) failAt(i);
    const ch = text[i];
    if (ch === '{') {
      i += 1;
      skipWs();
      if (text[i] === '}') {
        i += 1;
        return;
      }
      while (true) {
        skipWs();
        parseString();
        skipWs();
        if (text[i] !== ':') failAt(i);
        i += 1;
        parseValue();
        skipWs();
        if (text[i] === ',') {
          i += 1;
          continue;
        }
        if (text[i] === '}') {
          i += 1;
          return;
        }
        failAt(i);
      }
    } else if (ch === '[') {
      i += 1;
      skipWs();
      if (text[i] === ']') {
        i += 1;
        return;
      }
      while (true) {
        parseValue();
        skipWs();
        if (text[i] === ',') {
          i += 1;
          continue;
        }
        if (text[i] === ']') {
          i += 1;
          return;
        }
        failAt(i);
      }
    } else if (ch === '"') {
      parseString();
    } else if (ch === '-' || (ch >= '0' && ch <= '9')) {
      parseNumber();
    } else if (ch === 't') {
      parseKeyword('true');
    } else if (ch === 'f') {
      parseKeyword('false');
    } else if (ch === 'n') {
      parseKeyword('null');
    } else {
      failAt(i);
    }
  };

  try {
    parseValue();
    skipWs();
    if (i < len) failAt(i);
  } catch (errPos) {
    if (typeof errPos === 'number') {
      return getLineColFromPosition(text, errPos);
    }
  }
  return getLineColFromPosition(text, i);
}

function extractJsonSyntaxLocation(
  text: string,
  err: SyntaxError,
): { line?: number; column?: number } {
  const msg = err.message;
  const lineColMatch = msg.match(/line\s+(\d+)\s+column\s+(\d+)/i);
  if (lineColMatch) {
    return {
      line: Number.parseInt(lineColMatch[1], 10),
      column: Number.parseInt(lineColMatch[2], 10),
    };
  }
  const posMatch = msg.match(/position\s+(\d+)/i);
  if (posMatch) {
    return getLineColFromPosition(text, Number.parseInt(posMatch[1], 10));
  }
  return locateJsonSyntaxError(text);
}

function hasDefinitionKeys(value: Record<string, unknown>): boolean {
  return (
    isPlainObject(value.triggers) ||
    isPlainObject(value.actions) ||
    (typeof value.$schema === 'string' && value.$schema.toLowerCase().includes('workflowdefinition'))
  );
}

function looksLikeDefinition(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value) && hasDefinitionKeys(value);
}

function findWorkflowInArmResources(
  resources: unknown[],
): { definition: Record<string, unknown>; kind?: string; name?: string } | undefined {
  for (const item of resources) {
    if (!isPlainObject(item)) continue;
    const props = isPlainObject(item.properties) ? item.properties : undefined;
    if (props && looksLikeDefinition(props.definition)) {
      return {
        definition: props.definition,
        kind:
          typeof item.kind === 'string'
            ? item.kind
            : typeof props.kind === 'string'
              ? props.kind
              : undefined,
        name: typeof item.name === 'string' ? item.name : undefined,
      };
    }
    if (looksLikeDefinition(item.definition)) {
      return {
        definition: item.definition,
        kind: typeof item.kind === 'string' ? item.kind : undefined,
        name: typeof item.name === 'string' ? item.name : undefined,
      };
    }
    if (Array.isArray(item.resources)) {
      const nested = findWorkflowInArmResources(item.resources);
      if (nested) return nested;
    }
  }
  return undefined;
}

function normalizeDefinition(rawDef: Record<string, unknown>, warnings: string[]): WorkflowDefinition {
  let triggers: Record<string, RawTrigger> = {};
  if (isPlainObject(rawDef.triggers)) {
    triggers = rawDef.triggers as Record<string, RawTrigger>;
  } else if (rawDef.triggers !== undefined) {
    warnings.push('"triggers" was not an object and was ignored.');
  }

  let actions: Record<string, RawAction> = {};
  if (isPlainObject(rawDef.actions)) {
    actions = rawDef.actions as Record<string, RawAction>;
  } else if (rawDef.actions !== undefined) {
    warnings.push('"actions" was not an object and was ignored.');
  }

  return {
    $schema: typeof rawDef.$schema === 'string' ? rawDef.$schema : undefined,
    contentVersion: typeof rawDef.contentVersion === 'string' ? rawDef.contentVersion : undefined,
    parameters: isPlainObject(rawDef.parameters) ? rawDef.parameters : undefined,
    triggers,
    actions,
    outputs: isPlainObject(rawDef.outputs) ? rawDef.outputs : undefined,
  };
}

export function parseWorkflowJson(input: string): ParseResult {
  if (!input.trim()) {
    return {
      ok: false,
      error: {
        message: 'Paste a workflow.json or select a sample workflow to preview.',
        isEmpty: true,
      },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (err) {
    if (err instanceof SyntaxError) {
      const loc = extractJsonSyntaxLocation(input, err);
      return {
        ok: false,
        error: {
          message: err.message,
          line: loc.line,
          column: loc.column,
        },
      };
    }
    return {
      ok: false,
      error: {
        message: 'Failed to parse JSON input.',
      },
    };
  }

  if (!isPlainObject(parsed)) {
    return {
      ok: false,
      error: {
        message: 'Root JSON value must be an object.',
      },
    };
  }

  const warnings: string[] = [];
  let rawDef: Record<string, unknown> | undefined;
  let kind: string | undefined;
  let workflowName: string | undefined;
  let format: DetectedFormat = 'standard';

  // 1. Azure Logic Apps Standard workflow.json: { definition: { triggers, actions }, kind }
  if (looksLikeDefinition(parsed.definition)) {
    rawDef = parsed.definition;
    kind = typeof parsed.kind === 'string' ? parsed.kind : undefined;
    workflowName = typeof parsed.name === 'string' ? parsed.name : undefined;
    format = 'standard';
  }
  // 2. Bare WDL definition: { triggers, actions }
  else if (hasDefinitionKeys(parsed)) {
    rawDef = parsed;
    kind = typeof parsed.kind === 'string' ? parsed.kind : undefined;
    format = 'wdl-definition';
  }
  // 3. Single ARM Resource: { properties: { definition: ... } }
  else if (isPlainObject(parsed.properties) && looksLikeDefinition(parsed.properties.definition)) {
    rawDef = parsed.properties.definition;
    kind =
      typeof parsed.kind === 'string'
        ? parsed.kind
        : typeof parsed.properties.kind === 'string'
          ? parsed.properties.kind
          : undefined;
    workflowName = typeof parsed.name === 'string' ? parsed.name : undefined;
    format = 'arm-resource';
  }
  // 4. ARM Deployment Template: { resources: [ ... ] }
  else if (Array.isArray(parsed.resources)) {
    const found = findWorkflowInArmResources(parsed.resources);
    if (found) {
      rawDef = found.definition;
      kind = found.kind;
      workflowName = found.name;
      format = 'arm-template';
    }
  }

  if (!rawDef) {
    return {
      ok: false,
      error: {
        message:
          'JSON does not contain a Logic Apps workflow definition (expected "definition.triggers"/"definition.actions" or root "triggers"/"actions").',
      },
    };
  }

  const definition = normalizeDefinition(rawDef, warnings);

  if (
    Object.keys(definition.triggers).length === 0 &&
    Object.keys(definition.actions).length === 0
  ) {
    warnings.push('Workflow definition has no triggers or actions.');
  }

  return {
    ok: true,
    data: {
      definition,
      kind,
      format,
      workflowName,
      warnings,
    },
  };
}
