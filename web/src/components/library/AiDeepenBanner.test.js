import { describe, it, expect } from 'vitest';
import { shouldShowDeepenBanner } from './AiDeepenBanner.jsx';

describe('shouldShowDeepenBanner', () => {
  it('shows for a fresh url import', () => {
    expect(shouldShowDeepenBanner({ source: 'url', raw: { meta: { ai_deepened: false } } })).toBe(true);
  });
  it('hides once deepened', () => {
    expect(shouldShowDeepenBanner({ source: 'url', raw: { meta: { ai_deepened: true } } })).toBe(false);
  });
  it('hides for non-url sources', () => {
    expect(shouldShowDeepenBanner({ source: 'image', raw: { meta: {} } })).toBe(false);
  });
});
