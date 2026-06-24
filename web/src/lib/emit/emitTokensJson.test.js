import { describe, it, expect } from 'vitest';
import { emitTokensJson } from './emitTokensJson.js';

const tokens = [
  { group: 'color', name: 'button-primary', value: '#022d2c', confidence: 'high' },
  { group: 'color', name: 'text-secondary', value: '#706a6a', confidence: 'low' },
  { group: 'font', name: 'headline', value: { fontSize: '32px', fontWeight: '700' }, confidence: 'high' },
  { group: 'spacing', name: 'gutter', value: '16px', confidence: 'high' },
  { group: 'radius', name: 'card', value: '8px', confidence: 'high' },
  { group: 'shadow', name: 'card', value: '0 1px 3px rgba(0,0,0,.1)', confidence: 'high' },
];

describe('emitTokensJson', () => {
  it('produces valid DTCG-shaped JSON', () => {
    const parsed = JSON.parse(emitTokensJson(tokens));
    expect(parsed.color['button-primary']).toEqual({ $value: '#022d2c', $type: 'color' });
    expect(parsed.typography.headline).toEqual({
      $value: { fontSize: '32px', fontWeight: '700' }, $type: 'typography',
    });
    expect(parsed.spacing.gutter).toEqual({ $value: '16px', $type: 'dimension' });
    expect(parsed.radius.card).toEqual({ $value: '8px', $type: 'dimension' });
    expect(parsed.shadow.card).toEqual({ $value: '0 1px 3px rgba(0,0,0,.1)', $type: 'shadow' });
  });

  it('adds a confidence field only to low-confidence tokens', () => {
    const parsed = JSON.parse(emitTokensJson(tokens));
    expect(parsed.color['text-secondary'].confidence).toBe('low');
    expect(parsed.color['button-primary'].confidence).toBeUndefined();
  });

  it('omits empty sections', () => {
    const parsed = JSON.parse(emitTokensJson([
      { group: 'color', name: 'x', value: '#fff', confidence: 'high' },
    ]));
    expect(parsed.color).toBeDefined();
    expect(parsed.spacing).toBeUndefined();
  });
});
