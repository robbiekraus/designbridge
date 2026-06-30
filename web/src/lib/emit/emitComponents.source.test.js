import { describe, it, expect } from 'vitest';
import { emitComponents } from './emitComponents.js';

describe('emitComponents source passthrough', () => {
  it('carries source and notes from the recognized item', () => {
    const result = {
      raw: {
        tokens: {},
        atomics: [{ name: 'Button', confidence: 'high', source: 'rules+ai', notes: 'Input → Suche' }],
        components: [],
        patterns: [],
      },
    };
    const items = emitComponents(result, 'atomic');
    expect(items[0].source).toBe('rules+ai');
    expect(items[0].notes).toBe('Input → Suche');
  });
});
