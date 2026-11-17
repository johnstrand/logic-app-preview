import type { ReactNode } from 'react';

function renderStringWithExpressions(text: string): ReactNode {
  if (!text.includes('@')) {
    return <span className="expr-str">{text === '' ? '""' : text}</span>;
  }

  // Highlight @{...} interpolations or standalone @expression() strings
  if (text.startsWith('@') && !text.includes('@{')) {
    return <code className="expr-pill">{text}</code>;
  }

  const parts = text.split(/(@\{[^}]+\})/g);
  return (
    <span className="expr-str">
      {parts.map((part, idx) =>
        part.startsWith('@{') && part.endsWith('}') ? (
          <code key={idx} className="expr-pill">
            {part}
          </code>
        ) : (
          <span key={idx}>{part}</span>
        ),
      )}
    </span>
  );
}

interface ExpressionValueProps {
  value: unknown;
  depth?: number;
}

export function ExpressionValue({ value, depth = 0 }: ExpressionValueProps) {
  if (value === null) {
    return <span className="expr-primitive expr-primitive--null">null</span>;
  }
  if (value === undefined) {
    return <span className="expr-primitive expr-primitive--null">undefined</span>;
  }
  if (typeof value === 'boolean') {
    return <span className="expr-primitive expr-primitive--bool">{String(value)}</span>;
  }
  if (typeof value === 'number') {
    return <span className="expr-primitive expr-primitive--num">{value}</span>;
  }
  if (typeof value === 'string') {
    return renderStringWithExpressions(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="expr-empty">[]</span>;
    }
    return (
      <div className={`expr-list ${depth > 0 ? 'expr-list--nested' : ''}`}>
        {value.map((item, idx) => (
          <div key={idx} className="expr-list-item">
            <span className="expr-list-idx">{idx}</span>
            <div className="expr-list-val">
              <ExpressionValue value={item} depth={depth + 1} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return <span className="expr-empty">{'{}'}</span>;
    }
    return (
      <div className={`expr-obj ${depth > 0 ? 'expr-obj--nested' : ''}`}>
        {entries.map(([k, v]) => (
          <div key={k} className="expr-kv">
            <div className="expr-key" title={k}>
              {k}
            </div>
            <div className="expr-val">
              <ExpressionValue value={v} depth={depth + 1} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return <span>{String(value)}</span>;
}
