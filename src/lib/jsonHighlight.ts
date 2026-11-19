export type JsonTokenType =
  | 'key'
  | 'string'
  | 'number'
  | 'boolean'
  | 'null'
  | 'punctuation'
  | 'plain';

export interface JsonToken {
  type: JsonTokenType;
  value: string;
}

const JSON_TOKEN_REGEX =
  /("(?:\\.|[^"\\])*")(?=\s*:)|"(?:\\.|[^"\\])*"|\b(?:true|false)\b|\bnull\b|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}[\]:,]/g;

/**
 * Losslessly tokenizes a JSON string into syntax-highlighting tokens.
 */
export function tokenizeJson(json: string): JsonToken[] {
  const tokens: JsonToken[] = [];
  let lastIndex = 0;

  for (const match of json.matchAll(JSON_TOKEN_REGEX)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      tokens.push({ type: 'plain', value: json.slice(lastIndex, index) });
    }

    const value = match[0];
    let type: JsonTokenType;
    if (match[1] !== undefined) {
      type = 'key';
    } else if (value.startsWith('"')) {
      type = 'string';
    } else if (value === 'true' || value === 'false') {
      type = 'boolean';
    } else if (value === 'null') {
      type = 'null';
    } else if (/^[{}[\]:,]$/.test(value)) {
      type = 'punctuation';
    } else {
      type = 'number';
    }

    tokens.push({ type, value });
    lastIndex = index + value.length;
  }

  if (lastIndex < json.length) {
    tokens.push({ type: 'plain', value: json.slice(lastIndex) });
  }

  return tokens;
}
