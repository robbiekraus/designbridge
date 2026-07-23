import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StartScreen from './StartScreen.jsx';

const cached = {
  source: 'image',
  raw: { meta: { image_filename: 'dashboard.png' } },
  categories: [
    { key: 'colors', count: 16 }, { key: 'typography', count: 5 },
    { key: 'inventory', extra: { atoms: 5, molecules: 3, organisms: 6, templates: 1 } },
  ],
};

describe('StartScreen', () => {
  it('zeigt Tagline, „Neuer Import" und vier Quellen-Kacheln', () => {
    render(<StartScreen onNewImport={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Neuer Import' })).toBeInTheDocument();
    ['Bild', 'URL', 'Repo', 'Figma'].forEach((s) =>
      expect(screen.getByRole('heading', { name: s })).toBeInTheDocument());
  });

  it('ohne Cache keine „fortsetzen"-Karte', () => {
    render(<StartScreen onNewImport={vi.fn()} cachedImport={null} />);
    expect(screen.queryByText(/fortsetzen/i)).not.toBeInTheDocument();
  });

  it('mit Cache: Titel + Zähler; Öffnen/verwerfen rufen die Handler', () => {
    const onResume = vi.fn();
    const onDiscard = vi.fn();
    render(<StartScreen onNewImport={vi.fn()} cachedImport={cached} onResume={onResume} onDiscard={onDiscard} />);
    expect(screen.getByText(/dashboard\.png/)).toBeInTheDocument();
    expect(screen.getByText(/21 Tokens · 5 Atoms · 3 Molecules · 6 Organisms · 1 Templates/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Öffnen' }));
    expect(onResume).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'verwerfen' }));
    expect(onDiscard).toHaveBeenCalled();
  });

  it('Quellen-Kachel öffnet den passenden Tab; „Neuer Import" ohne Tab', () => {
    const onNewImport = vi.fn();
    render(<StartScreen onNewImport={onNewImport} />);
    fireEvent.click(screen.getByRole('heading', { name: 'Bild' }).closest('button'));
    expect(onNewImport).toHaveBeenCalledWith('image');
    fireEvent.click(screen.getByRole('button', { name: 'Neuer Import' }));
    expect(onNewImport).toHaveBeenLastCalledWith();
  });

  it('Figma-Kachel ist deaktiviert', () => {
    render(<StartScreen onNewImport={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Figma' }).closest('button')).toBeDisabled();
  });
});
