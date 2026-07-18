import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import InterpretAllBar from './InterpretAllBar.jsx';

// Reale /repo-Shape: gehobene Items tragen sourceCode (liftRepoInventory) —
// nur die zählen für den Batch („gehobene Bausteine ohne Vorschau").
const repoWithTodo = {
  source: 'repo',
  raw: { meta: { import_id: 'id1' }, atoms: [], templates: [],
    organisms: [{ name: 'PricingWidget', path: 'p.tsx', sourceCode: 'export const PricingWidget=()=>null;' }] },
};

describe('InterpretAllBar', () => {
  it('zeigt Knopf bei Repo-Import mit offenen Bausteinen und triggert Batch', () => {
    const onInterpretAll = vi.fn();
    render(<InterpretAllBar result={repoWithTodo} onInterpretAll={onInterpretAll} />);
    fireEvent.click(screen.getByRole('button', { name: /Alle interpretieren/ }));
    expect(onInterpretAll).toHaveBeenCalled();
  });

  it('rendert nichts für Bild-Import', () => {
    const { container } = render(<InterpretAllBar result={{ source: 'image', raw: { meta: {}, atoms: [], molecules: [], organisms: [], templates: [] } }} onInterpretAll={() => {}} />);
    expect(container.firstChild).toBe(null);
  });

  it('retryBusy: Knopf gesperrt + Hinweis „Einzel-Interpretation läuft — gleich wieder verfügbar …"', () => {
    const onInterpretAll = vi.fn();
    render(<InterpretAllBar result={repoWithTodo} onInterpretAll={onInterpretAll} retryBusy />);
    expect(screen.getByRole('button', { name: /Alle interpretieren/ })).toBeDisabled();
    expect(screen.getByText(/Einzel-Interpretation läuft — gleich wieder verfügbar/)).toBeInTheDocument();
  });

  it('retryBusy false: Knopf aktiv, Standard-Text unverändert', () => {
    const onInterpretAll = vi.fn();
    render(<InterpretAllBar result={repoWithTodo} onInterpretAll={onInterpretAll} retryBusy={false} />);
    expect(screen.getByRole('button', { name: /Alle interpretieren/ })).not.toBeDisabled();
    expect(screen.getByText(/gehobene Bausteine ohne Vorschau/)).toBeInTheDocument();
    expect(screen.queryByText(/Einzel-Interpretation läuft/)).toBeNull();
  });

  it('pending schlägt retryBusy im Text (Batch-Meldung hat Vorrang)', () => {
    const pendingResult = { ...repoWithTodo, interpretPending: true };
    render(<InterpretAllBar result={pendingResult} onInterpretAll={() => {}} retryBusy />);
    expect(screen.getByText(/Bausteine werden interpretiert/)).toBeInTheDocument();
    expect(screen.queryByText(/Einzel-Interpretation läuft/)).toBeNull();
    expect(screen.getByRole('button', { name: /Alle interpretieren/ })).toBeDisabled();
  });

  it('Quota-Bremse: interpretQuotaExhausted sperrt den Knopf + zeigt die Quota-Meldung als Text und Tooltip', () => {
    const quotaResult = { ...repoWithTodo, interpretQuotaExhausted: true };
    render(<InterpretAllBar result={quotaResult} onInterpretAll={() => {}} />);
    const button = screen.getByRole('button', { name: /Alle interpretieren/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', expect.stringMatching(/Tages-Kontingent erschöpft/));
    expect(screen.getByText(/Tages-Kontingent erschöpft/)).toBeInTheDocument();
  });
});
