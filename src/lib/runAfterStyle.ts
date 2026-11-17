import type { RunAfterStatus } from '../types/workflow';

export interface RunAfterVisualStyle {
  stroke: string;
  dashArray?: string;
  isDefaultSucceededOnly: boolean;
  label: string;
  badgeClass: 'failed' | 'timedout' | 'skipped' | 'mixed';
}

export function getRunAfterVisualStyle(
  statuses: RunAfterStatus[] | undefined,
  theme: 'light' | 'dark' = 'light',
): RunAfterVisualStyle {
  const list = statuses && statuses.length > 0 ? statuses : ['Succeeded'];
  const normalized = list.map((s) => s.toLowerCase());

  if (normalized.length === 1 && normalized[0] === 'succeeded') {
    return {
      stroke: theme === 'dark' ? '#94a3b8' : '#64748b',
      isDefaultSucceededOnly: true,
      label: '',
      badgeClass: 'mixed',
    };
  }

  const hasFailed = normalized.includes('failed');
  const hasTimedOut = normalized.includes('timedout');
  const hasSkipped = normalized.includes('skipped');
  const label = list.join(' · ');

  if (normalized.length === 1 && hasFailed) {
    return {
      stroke: '#ef4444',
      dashArray: '6 4',
      isDefaultSucceededOnly: false,
      label,
      badgeClass: 'failed',
    };
  }

  if (normalized.length === 1 && hasTimedOut) {
    return {
      stroke: '#f59e0b',
      dashArray: '6 4',
      isDefaultSucceededOnly: false,
      label,
      badgeClass: 'timedout',
    };
  }

  if (normalized.length === 1 && hasSkipped) {
    return {
      stroke: theme === 'dark' ? '#64748b' : '#94a3b8',
      dashArray: '3 4',
      isDefaultSucceededOnly: false,
      label,
      badgeClass: 'skipped',
    };
  }

  if (hasFailed && !normalized.includes('succeeded')) {
    return {
      stroke: '#ef4444',
      dashArray: '6 4',
      isDefaultSucceededOnly: false,
      label,
      badgeClass: 'failed',
    };
  }

  return {
    stroke: '#6366f1',
    dashArray: '5 3',
    isDefaultSucceededOnly: false,
    label,
    badgeClass: 'mixed',
  };
}
