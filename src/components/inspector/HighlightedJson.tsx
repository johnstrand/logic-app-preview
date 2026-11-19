import { Fragment, useMemo } from 'react';
import { tokenizeJson } from '../../lib/jsonHighlight';

const MAX_HIGHLIGHT_CHARS = 200_000;

interface HighlightedJsonProps {
  json: string;
}

/**
 * Renders formatted JSON with theme-aware syntax highlighting tokens.
 */
export function HighlightedJson({ json }: HighlightedJsonProps) {
  const tokens = useMemo(() => {
    if (json.length > MAX_HIGHLIGHT_CHARS) {
      return null;
    }
    return tokenizeJson(json);
  }, [json]);

  return (
    <pre className="raw-json-pre">
      <code>
        {tokens === null
          ? json
          : tokens.map((token, idx) =>
              token.type === 'plain' ? (
                <Fragment key={idx}>{token.value}</Fragment>
              ) : (
                <span key={idx} className={`json-tok json-tok--${token.type}`}>
                  {token.value}
                </span>
              ),
            )}
      </code>
    </pre>
  );
}
