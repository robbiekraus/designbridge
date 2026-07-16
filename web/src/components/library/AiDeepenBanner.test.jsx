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

  it('shows for a fresh repo import and hides once deepened', () => {
    expect(shouldShowDeepenBanner({ source: 'repo', raw: { meta: { ai_deepened: false } } })).toBe(true);
    expect(shouldShowDeepenBanner({ source: 'repo', raw: { meta: { ai_deepened: true } } })).toBe(false);
  });
});
