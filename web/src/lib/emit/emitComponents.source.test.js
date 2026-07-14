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

  it('lifted item mit Template-Namens-Kollision ignoriert das Template (FF2)', () => {
    // "CardSkeleton" matcht das card-Template — darf den gehobenen Code aber
    // NICHT auf die generische Template-Vorschau kapern.
    const result = {
      raw: {
        tokens: {},
        atomics: [],
        components: [{
          name: 'CardSkeleton', confidence: 'high', source: 'rules',
          sourceCode: 'export const CardSkeleton = () => <div className="animate-pulse" />;',
          path: 'src/components/ui/card-skeleton.tsx',
        }],
        patterns: [],
      },
    };
    const [card] = emitComponents(result, 'component');
    expect(card.lifted).toBe(true);
    expect(card.code).toBe(result.raw.components[0].sourceCode); // echter Code
    expect(card.templateKey).toBe(null);   // Template ignoriert
    expect(card.hasPreview).toBe(false);    // keine generische Template-Vorschau
    expect(card.variants).toEqual([]);      // keine Template-Varianten
    expect(card.filename).toBe('card-skeleton.tsx'); // echter Dateiname
  });
});
