import LZString from 'lz-string';

const HASH_PREFIX = '#wf=';

export function readWorkflowFromUrlHash(): string | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash;
  if (!hash.startsWith(HASH_PREFIX)) return null;
  const encoded = hash.slice(HASH_PREFIX.length);
  if (!encoded) return null;

  try {
    const decompressed = LZString.decompressFromEncodedURIComponent(encoded);
    return decompressed && decompressed.trim().length > 0 ? decompressed : null;
  } catch {
    return null;
  }
}

export function buildShareableWorkflowUrl(jsonText: string): string {
  const compressed = LZString.compressToEncodedURIComponent(jsonText);
  const baseUrl = `${window.location.origin}${window.location.pathname}${window.location.search}`;
  const shareUrl = `${baseUrl}${HASH_PREFIX}${compressed}`;
  try {
    window.history.replaceState(null, '', `${HASH_PREFIX}${compressed}`);
  } catch {
    // Ignore history restrictions in embedded contexts
  }
  return shareUrl;
}
