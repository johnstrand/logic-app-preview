import type { NodeIconName, RawAction, RawTrigger } from '../types/workflow';

export interface NodeVisuals {
  normalizedType: string;
  categoryColor: string;
  iconName: NodeIconName;
  subtitle: string;
  categoryLabel: string;
}

const CONTAINER_TYPES = new Set(['scope', 'if', 'switch', 'foreach', 'until']);

export function isContainerActionType(type: string | undefined): boolean {
  if (!type) return false;
  return CONTAINER_TYPES.has(type.trim().toLowerCase());
}

export function formatActionKey(key: string): string {
  return key.replace(/_/g, ' ');
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function truncate(text: string, maxLen = 42): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}

function extractLastSegment(pathValue: string): string {
  const cleaned = pathValue.replace(/\/+$/, '');
  const parts = cleaned.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? pathValue;
}

function formatServiceProviderName(serviceProviderId: string): string {
  const seg = extractLastSegment(serviceProviderId).toLowerCase();
  const known: Record<string, string> = {
    servicebus: 'Service Bus',
    azureblob: 'Azure Blob',
    azurequeues: 'Azure Queue',
    azuretables: 'Azure Table',
    azurecosmosdb: 'Cosmos DB',
    eventhubs: 'Event Hubs',
    sql: 'SQL Server',
    smtp: 'SMTP',
    sftp: 'SFTP',
    ftp: 'FTP',
    filesystem: 'File System',
    mq: 'IBM MQ',
    sap: 'SAP',
    openai: 'Azure OpenAI',
  };
  return known[seg] ?? extractLastSegment(serviceProviderId);
}

function resolveServiceProviderSubtitle(inputs: Record<string, unknown> | undefined): string {
  const cfg = asRecord(inputs?.serviceProviderConfiguration);
  if (!cfg) return 'Built-in Connector';
  const spId = typeof cfg.serviceProviderId === 'string' ? cfg.serviceProviderId : '';
  const opId = typeof cfg.operationId === 'string' ? cfg.operationId : '';
  const connName = typeof cfg.connectionName === 'string' ? cfg.connectionName : '';
  const provider = spId ? formatServiceProviderName(spId) : connName || 'Built-in';
  if (opId) {
    return truncate(`${provider} · ${opId}`);
  }
  return truncate(provider);
}

function resolveApiConnectionSubtitle(inputs: Record<string, unknown> | undefined): string {
  const host = asRecord(inputs?.host);
  const conn = asRecord(host?.connection);
  const api = asRecord(host?.api);
  const refName =
    typeof conn?.referenceName === 'string'
      ? conn.referenceName
      : typeof conn?.name === 'string'
        ? extractLastSegment(conn.name)
        : typeof api?.id === 'string'
          ? extractLastSegment(api.id)
          : '';
  const method = typeof inputs?.method === 'string' ? inputs.method.toUpperCase() : '';
  const path = typeof inputs?.path === 'string' ? inputs.path : '';
  if (refName && method) return truncate(`${refName} · ${method} ${path}`);
  if (refName && path) return truncate(`${refName} · ${path}`);
  if (refName) return truncate(`Connector · ${refName}`);
  if (method || path) return truncate(`${method} ${path}`.trim());
  return 'Managed Connector';
}

export function getContainerKindLabel(normalizedType: string): string {
  switch (normalizedType) {
    case 'scope':
      return 'Scope';
    case 'if':
      return 'Condition';
    case 'switch':
      return 'Switch';
    case 'foreach':
      return 'For each';
    case 'until':
      return 'Until';
    default:
      return 'Container';
  }
}

export function resolveNodeVisuals(
  raw: RawTrigger | RawAction,
  isTrigger: boolean,
): NodeVisuals {
  const originalType = typeof raw.type === 'string' ? raw.type : 'Unknown';
  const normalizedType = originalType.trim().toLowerCase();
  const kind = typeof raw.kind === 'string' ? raw.kind : '';
  const inputs = asRecord(raw.inputs);

  if (normalizedType === 'request') {
    const method = typeof inputs?.method === 'string' ? inputs.method.toUpperCase() : '';
    const relPath = typeof inputs?.relativePath === 'string' ? inputs.relativePath : '';
    const detail = [method, relPath].filter(Boolean).join(' ');
    return {
      normalizedType,
      categoryColor: '#0f766e',
      iconName: 'webhook',
      subtitle: detail ? truncate(detail) : kind ? `Request · ${kind}` : 'HTTP Request Trigger',
      categoryLabel: 'Request Trigger',
    };
  }

  if (normalizedType === 'recurrence' || normalizedType === 'slidingwindow') {
    const rec = asRecord((raw as RawTrigger).recurrence);
    const freq = typeof rec?.frequency === 'string' ? rec.frequency : '';
    const interval =
      typeof rec?.interval === 'number' || typeof rec?.interval === 'string'
        ? rec.interval
        : '';
    const subtitle =
      freq && interval
        ? `Every ${interval} ${freq}`
        : freq || (normalizedType === 'slidingwindow' ? 'Sliding Window' : 'Schedule');
    return {
      normalizedType,
      categoryColor: '#0284c7',
      iconName: 'clock',
      subtitle: truncate(subtitle),
      categoryLabel: 'Schedule Trigger',
    };
  }

  if (normalizedType === 'http' || normalizedType === 'httpwebhook') {
    const method = typeof inputs?.method === 'string' ? inputs.method.toUpperCase() : 'HTTP';
    const uri = typeof inputs?.uri === 'string' ? inputs.uri : '';
    const cleanUri = uri.replace(/^https?:\/\//i, '');
    return {
      normalizedType,
      categoryColor: '#6d28d9',
      iconName: 'globe',
      subtitle: cleanUri ? truncate(`${method} ${cleanUri}`) : `${method} Request`,
      categoryLabel: 'HTTP',
    };
  }

  if (normalizedType === 'response') {
    const statusCode =
      typeof inputs?.statusCode === 'number' || typeof inputs?.statusCode === 'string'
        ? String(inputs.statusCode)
        : '200';
    return {
      normalizedType,
      categoryColor: '#059669',
      iconName: 'send',
      subtitle: `Response · HTTP ${statusCode}`,
      categoryLabel: 'Response',
    };
  }

  if (normalizedType === 'serviceprovider') {
    return {
      normalizedType,
      categoryColor: '#0078d4',
      iconName: 'plug',
      subtitle: resolveServiceProviderSubtitle(inputs),
      categoryLabel: 'Built-in Connector',
    };
  }

  if (normalizedType === 'apiconnection' || normalizedType === 'apiconnectionwebhook') {
    return {
      normalizedType,
      categoryColor: '#0369a1',
      iconName: 'cloud',
      subtitle: resolveApiConnectionSubtitle(inputs),
      categoryLabel: 'Managed Connector',
    };
  }

  if (
    normalizedType === 'compose' ||
    normalizedType === 'parsejson' ||
    normalizedType === 'select' ||
    normalizedType === 'query' ||
    normalizedType === 'join' ||
    normalizedType === 'table' ||
    normalizedType === 'csvtable' ||
    normalizedType === 'htmltable' ||
    normalizedType === 'liquid' ||
    normalizedType === 'xslt' ||
    normalizedType === 'flatfileencoding' ||
    normalizedType === 'flatfiledecoding'
  ) {
    return {
      normalizedType,
      categoryColor: '#d97706',
      iconName: 'code',
      subtitle: kind ? `${originalType} · ${kind}` : originalType,
      categoryLabel: 'Data Operation',
    };
  }

  if (
    normalizedType === 'initializevariable' ||
    normalizedType === 'setvariable' ||
    normalizedType === 'incrementvariable' ||
    normalizedType === 'decrementvariable' ||
    normalizedType === 'appendtoarrayvariable' ||
    normalizedType === 'appendtostringvariable'
  ) {
    const variables = Array.isArray(inputs?.variables) ? inputs?.variables : undefined;
    const firstVar = variables && variables.length > 0 ? asRecord(variables[0]) : undefined;
    const varName =
      typeof firstVar?.name === 'string'
        ? firstVar.name
        : typeof inputs?.name === 'string'
          ? inputs.name
          : '';
    const varType = typeof firstVar?.type === 'string' ? ` (${firstVar.type})` : '';
    return {
      normalizedType,
      categoryColor: '#9333ea',
      iconName: 'variable',
      subtitle: varName ? truncate(`${varName}${varType}`) : originalType,
      categoryLabel: 'Variable',
    };
  }

  if (normalizedType === 'workflow') {
    const host = asRecord(inputs?.host);
    const wf = asRecord(host?.workflow);
    const wfId = typeof wf?.id === 'string' ? extractLastSegment(wf.id) : '';
    return {
      normalizedType,
      categoryColor: '#4f46e5',
      iconName: 'workflow',
      subtitle: wfId ? truncate(`Invoke · ${wfId}`) : 'Child Workflow',
      categoryLabel: 'Workflow',
    };
  }

  if (
    normalizedType === 'function' ||
    normalizedType === 'javascriptcode' ||
    normalizedType === 'csharp'
  ) {
    return {
      normalizedType,
      categoryColor: '#ea580c',
      iconName: 'terminal',
      subtitle: kind ? `${originalType} · ${kind}` : `${originalType} Code`,
      categoryLabel: 'Code / Function',
    };
  }

  if (normalizedType === 'terminate') {
    const runStatus = typeof inputs?.runStatus === 'string' ? inputs.runStatus : '';
    return {
      normalizedType,
      categoryColor: '#dc2626',
      iconName: 'terminate',
      subtitle: runStatus ? `Terminate · ${runStatus}` : 'Terminate Run',
      categoryLabel: 'Control',
    };
  }

  if (normalizedType === 'scope') {
    return {
      normalizedType,
      categoryColor: '#475569',
      iconName: 'layers',
      subtitle: 'Group actions & error scope',
      categoryLabel: 'Scope',
    };
  }

  if (normalizedType === 'if') {
    return {
      normalizedType,
      categoryColor: '#0d9488',
      iconName: 'split',
      subtitle: 'True / False condition',
      categoryLabel: 'Condition',
    };
  }

  if (normalizedType === 'switch') {
    const casesCount = Object.keys((raw as RawAction).cases ?? {}).length;
    return {
      normalizedType,
      categoryColor: '#7c3aed',
      iconName: 'route',
      subtitle: `${casesCount} case${casesCount === 1 ? '' : 's'} + Default`,
      categoryLabel: 'Switch',
    };
  }

  if (normalizedType === 'foreach') {
    const rawForeach = (raw as RawAction).foreach;
    const expr = typeof rawForeach === 'string' ? rawForeach : '';
    return {
      normalizedType,
      categoryColor: '#2563eb',
      iconName: 'repeat',
      subtitle: expr ? truncate(expr) : 'Iterate collection',
      categoryLabel: 'For each',
    };
  }

  if (normalizedType === 'until') {
    const rawExpr = (raw as RawAction).expression;
    const expr = typeof rawExpr === 'string' ? rawExpr : '';
    return {
      normalizedType,
      categoryColor: '#4338ca',
      iconName: 'rotate',
      subtitle: expr ? truncate(expr) : 'Loop until condition',
      categoryLabel: 'Until',
    };
  }

  return {
    normalizedType,
    categoryColor: isTrigger ? '#0f766e' : '#0078d4',
    iconName: 'box',
    subtitle: kind ? `${originalType} · ${kind}` : originalType,
    categoryLabel: isTrigger ? 'Trigger' : 'Action',
  };
}
