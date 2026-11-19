import { describe, expect, it } from 'vitest';
import { WORKFLOW_SAMPLES } from '../../data/samples';
import { tokenizeJson } from '../jsonHighlight';

describe('tokenizeJson', () => {
  it('round-trips every sample workflow losslessly', () => {
    for (const sample of WORKFLOW_SAMPLES) {
      const tokens = tokenizeJson(sample.json);
      expect(tokens.map((t) => t.value).join('')).toBe(sample.json);
      expect(tokens.some((t) => t.type === 'key')).toBe(true);
      expect(tokens.some((t) => t.type === 'string')).toBe(true);
    }
  });

  it('classifies keys, strings, numbers, booleans, null, punctuation, and whitespace accurately', () => {
    const input = JSON.stringify(
      {
        '': 'empty key',
        'escaped"quote': 'https://example.com/a:b',
        trailingSlash: 'foo\\',
        expr: '@equals(1, 1)',
        stringLiterals: ['true', 'false', 'null', '42'],
        nums: [0, -12, 3.14, 1.5e-3, -2e+4],
        flags: [true, false, null],
      },
      null,
      2,
    );

    const tokens = tokenizeJson(input);
    expect(tokens.map((t) => t.value).join('')).toBe(input);

    const nonPlain = tokens.filter((t) => t.type !== 'plain');

    expect(nonPlain).toContainEqual({ type: 'key', value: '""' });
    expect(nonPlain).toContainEqual({ type: 'string', value: '"empty key"' });
    expect(nonPlain).toContainEqual({ type: 'key', value: '"escaped\\"quote"' });
    expect(nonPlain).toContainEqual({ type: 'string', value: '"https://example.com/a:b"' });
    expect(nonPlain).toContainEqual({ type: 'string', value: '"foo\\\\"' });
    expect(nonPlain).toContainEqual({ type: 'string', value: '"@equals(1, 1)"' });

    // Stringified primitives remain strings, not booleans/null/numbers
    expect(nonPlain).toContainEqual({ type: 'string', value: '"true"' });
    expect(nonPlain).toContainEqual({ type: 'string', value: '"false"' });
    expect(nonPlain).toContainEqual({ type: 'string', value: '"null"' });
    expect(nonPlain).toContainEqual({ type: 'string', value: '"42"' });

    // Numeric variants
    expect(nonPlain).toContainEqual({ type: 'number', value: '0' });
    expect(nonPlain).toContainEqual({ type: 'number', value: '-12' });
    expect(nonPlain).toContainEqual({ type: 'number', value: '3.14' });
    expect(nonPlain).toContainEqual({ type: 'number', value: '0.0015' });
    expect(nonPlain).toContainEqual({ type: 'number', value: '-20000' });

    // Booleans & null
    expect(nonPlain).toContainEqual({ type: 'boolean', value: 'true' });
    expect(nonPlain).toContainEqual({ type: 'boolean', value: 'false' });
    expect(nonPlain).toContainEqual({ type: 'null', value: 'null' });

    // Punctuation
    expect(nonPlain).toContainEqual({ type: 'punctuation', value: '{' });
    expect(nonPlain).toContainEqual({ type: 'punctuation', value: '}' });
    expect(nonPlain).toContainEqual({ type: 'punctuation', value: '[' });
    expect(nonPlain).toContainEqual({ type: 'punctuation', value: ']' });
    expect(nonPlain).toContainEqual({ type: 'punctuation', value: ':' });
    expect(nonPlain).toContainEqual({ type: 'punctuation', value: ',' });

    // Whitespace preserved as plain
    expect(tokens.some((t) => t.type === 'plain' && /^\s+$/.test(t.value))).toBe(true);
  });

  it('tokenizes scientific notation numbers even when passed raw unparsed JSON', () => {
    const raw = '{"sciSmall": 1.5e-3, "sciLarge": -2E+4}';
    const tokens = tokenizeJson(raw);
    expect(tokens.map((t) => t.value).join('')).toBe(raw);
    expect(tokens).toContainEqual({ type: 'number', value: '1.5e-3' });
    expect(tokens).toContainEqual({ type: 'number', value: '-2E+4' });
  });
});
