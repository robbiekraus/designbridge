import { describe, it, expect } from 'vitest';
import { emitComponents } from './emitComponents.js';

// DS-Grounding, Scheibe 1 Schritt 4 (Verdrahtung): emitComponents reicht den Default-Katalog an
// htmlToPlan durch — data-ds-markiertes Interpretations-HTML ergibt echten shadcn-Code.

const baseRaw = {
  tokens: { colors: [{ hex: '#18181b', role: 'primary', confidence: 'high' }], typography: [], spacing: [], border_radius: [], shadows: [] },
  atoms: [{ name: 'Aktion', variants: [], confidence: 'high' }], // Name ohne btn/button → kein Template-Treffer
  molecules: [], organisms: [], templates: [],
};

describe('emitComponents — DS-Grounding-Verdrahtung', () => {
  it('data-ds-markiertes Interpretations-HTML → echter Import + <Button> im Code', () => {
    const result = {
      raw: baseRaw,
      interpretations: {
        Aktion: { html: '<button data-ds-component="Button" data-ds-variant="secondary" data-ds-size="sm" style="padding:6px 12px">Speichern</button>', jsx: '' },
      },
    };
    const [item] = emitComponents(result, 'atom');
    expect(item.code).toContain('import { Button } from "@/components/ui/button";');
    expect(item.code).toContain('<Button variant="secondary" size="sm">Speichern</Button>');
  });

  it('ohne Marker: unveränderter Freihand-Code (kein Katalog-Import)', () => {
    const result = {
      raw: baseRaw,
      interpretations: { Aktion: { html: '<div style="background:#18181b;padding:8px">X</div>', jsx: '' } },
    };
    const [item] = emitComponents(result, 'atom');
    expect(item.code).not.toContain('import {');
    expect(item.code).toContain('export function');
  });
});
