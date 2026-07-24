import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App.jsx';

describe('App header', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ json: async () => ({ ai_key_configured: true }) });
    localStorage.clear();
  });

  it('renders the UIPrism wordmark, not the old Designbridge name', () => {
    render(<App />);
    // Wortmarke „UIPrism" erscheint im Header und im Start-Screen-Lockup.
    expect(screen.getAllByText('UI').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Prism').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Designbridge/i)).not.toBeInTheDocument();
  });

  it('renders the UIPrism brand mark image', () => {
    render(<App />);
    expect(screen.getByAltText('UIPrism')).toBeInTheDocument();
  });
});

describe('App — Start-Screen / Reload-Verhalten', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ json: async () => ({ ai_key_configured: true }) });
    localStorage.clear();
  });

  it('ohne Cache: Start-Screen statt Daten (keine Sidebar)', () => {
    render(<App />);
    expect(screen.getByText(/bring deine ui/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Neuer Import' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument();
  });

  it('mit Cache: bietet Fortsetzen an, lädt aber NICHT automatisch die alten Daten', () => {
    const cached = {
      source: 'image',
      raw: { meta: { image_filename: 'dashboard.png' }, tokens: {} },
      categories: [
        { key: 'colors', count: 16 },
        { key: 'inventory', extra: { atoms: 5, molecules: 3, organisms: 6, templates: 1 } },
      ],
    };
    localStorage.setItem('designbridge.lastImport', JSON.stringify(cached));
    render(<App />);
    expect(screen.getByText(/letzter import/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fortsetzen' })).toBeInTheDocument();
    // Kein Auto-Load: die Daten-Sidebar (Export) erscheint erst nach „Fortsetzen".
    expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument();
  });
});
