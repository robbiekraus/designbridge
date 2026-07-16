import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AiDeepenBanner, { shouldShowDeepenBanner } from './AiDeepenBanner.jsx';

describe('AiDeepenBanner copy', () => {
  const urlResult = { source: 'url', raw: { meta: { ai_deepened: false } } };

  it('describes refining component/pattern recognition, not generic token improvement', () => {
    render(<AiDeepenBanner result={urlResult} onDeepened={() => {}} />);
    // Der Knopf muss klar sagen, WAS die KI vertieft (Komponenten-Erkennung) —
    // nicht nur pauschal "Mit KI vertiefen", das nach Token-Verbesserung klingt.
    expect(screen.getByRole('button', { name: /Komponenten/i })).toBeInTheDocument();
    // Es darf nirgends behauptet werden, dass Design-Tokens dadurch besser/genauer würden —
    // real passiert nur ein zusätzlicher KI-Durchlauf über die Bausteinliste.
    expect(screen.queryByText(/Tokens?\s+(werden|sind|noch)?\s*(besser|genauer|verbessert)/i)).toBeNull();
  });
});

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
