import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import InterpretAllBar from './InterpretAllBar.jsx';

// Reale /repo-Shape: gehobene Items tragen sourceCode (liftRepoInventory) —
// nur die zählen für den Batch („gehobene Bausteine ohne Vorschau").
const repoWithTodo = {
  source: 'repo',
  raw: { meta: { import_id: 'id1' }, atomics: [], patterns: [],
    components: [{ name: 'PricingWidget', path: 'p.tsx', sourceCode: 'export const PricingWidget=()=>null;' }] },
};

describe('InterpretAllBar', () => {
  it('zeigt Knopf bei Repo-Import mit offenen Bausteinen und triggert Batch', () => {
    const onInterpretAll = vi.fn();
    render(<InterpretAllBar result={repoWithTodo} onInterpretAll={onInterpretAll} />);
    fireEvent.click(screen.getByRole('button', { name: /Alle interpretieren/ }));
    expect(onInterpretAll).toHaveBeenCalled();
  });

  it('rendert nichts für Bild-Import', () => {
    const { container } = render(<InterpretAllBar result={{ source: 'image', raw: { meta: {}, atomics: [], components: [], patterns: [] } }} onInterpretAll={() => {}} />);
    expect(container.firstChild).toBe(null);
  });
});
