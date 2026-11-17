import { getNodesBounds, getViewportForBounds } from '@xyflow/react';
import { toPng, toSvg } from 'html-to-image';
import type { AppNode } from '../types/workflow';

export type ExportFormat = 'png' | 'svg';

function triggerDownload(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  link.click();
}

export async function exportWorkflowDiagram(
  containerEl: HTMLElement,
  nodes: AppNode[],
  format: ExportFormat,
  theme: 'light' | 'dark',
  baseFilename = 'logic-app-workflow',
): Promise<void> {
  if (nodes.length === 0) {
    throw new Error('No workflow nodes to export.');
  }

  const viewportEl = containerEl.querySelector('.react-flow__viewport');
  if (!(viewportEl instanceof HTMLElement)) {
    throw new Error('Workflow canvas viewport not ready.');
  }

  const bounds = getNodesBounds(nodes);
  const pad = 96;
  const maxDim = 3600;
  const rawW = Math.max(800, Math.ceil(bounds.width + pad * 2));
  const rawH = Math.max(520, Math.ceil(bounds.height + pad * 2));
  const scaleDown = Math.min(1, maxDim / rawW, maxDim / rawH);
  const width = Math.round(rawW * scaleDown);
  const height = Math.round(rawH * scaleDown);

  const viewport = getViewportForBounds(bounds, width, height, 0.05, 2, 0.08);
  const backgroundColor = theme === 'dark' ? '#0f172a' : '#f8fafc';

  const exportOptions = {
    backgroundColor,
    width,
    height,
    skipFonts: true,
    pixelRatio: format === 'png' ? 2 : 1,
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
    },
  };

  const slug = baseFilename
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'logic-app-workflow';

  if (format === 'png') {
    const dataUrl = await toPng(viewportEl, exportOptions);
    triggerDownload(dataUrl, `${slug}.png`);
  } else {
    const dataUrl = await toSvg(viewportEl, exportOptions);
    triggerDownload(dataUrl, `${slug}.svg`);
  }
}
