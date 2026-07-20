import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LibraryObjectList from './LibraryObjectList.jsx';

const picks = { primary: '#022d2c', onPrimary: '#ffffff', text: '#18181b',
  surface: '#ffffff', surfaceMuted: '#f4f4f5', border: '#e4e4e7', radius: '8px',
  fontSize: '16px', fontWeight: '600' };

const items = [
  { name: 'Button', slug: 'button', filename: 'Button.jsx', kind: 'atom',
    templateKey: 'button', variants: ['primary', 'secondary', 'ghost'],
    code: 'export function Button() {}', confidence: 'high', hasPreview: true },
  { name: 'Hero section', slug: 'hero-section', filename: 'HeroSection.jsx', kind: 'organism',
    templateKey: null, variants: [], code: 'export function HeroSection() {}',
    confidence: 'low', hasPreview: false },
];

describe('LibraryObjectList', () => {
  it('shows a row per item and expands to reveal code on click', () => {
    render(<LibraryObjectList items={items} picks={picks} />);
    expect(screen.getByText('Button')).toBeInTheDocument();
    expect(screen.queryByText('export function Button() {}')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Button'));
    expect(screen.getByText('export function Button() {}')).toBeInTheDocument();
  });

  it('renders a variant switcher for template-backed items', () => {
    render(<LibraryObjectList items={items} picks={picks} />);
    fireEvent.click(screen.getByText('Button'));
    expect(screen.getByRole('button', { name: 'primary' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ghost' })).toBeInTheDocument();
  });

  it('shows the placeholder (no preview) for generic items', () => {
    render(<LibraryObjectList items={items} picks={picks} />);
    fireEvent.click(screen.getByText('Hero section'));
    expect(screen.getByText(/keine vorschau/i)).toBeInTheDocument();
  });

  it('copies code to the clipboard', () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.assign(navigator, { clipboard: { writeText } });
    render(<LibraryObjectList items={items} picks={picks} />);
    fireEvent.click(screen.getByText('Button'));
    fireEvent.click(screen.getByRole('button', { name: /kopieren/i }));
    expect(writeText).toHaveBeenCalledWith('export function Button() {}');
  });

  it('renders a correction note as muted italic text, not a pill', () => {
    const withNote = [
      { ...items[0], source: 'ai', notes: 'Variante manuell korrigiert' },
    ];
    render(<LibraryObjectList items={withNote} picks={picks} />);
    fireEvent.click(screen.getByText('Button'));
    const note = screen.getByText('Variante manuell korrigiert');
    expect(note).toBeInTheDocument();
    expect(note.className).not.toMatch(/amber/);
    expect(note.parentElement.className).toMatch(/italic/);
    expect(note.parentElement.className).not.toMatch(/amber/);
  });
});

function item(overrides = {}) {
  return {
    name: 'Avatar', slug: 'avatar', filename: 'Avatar.jsx', kind: 'atom',
    templateKey: null, variants: [], code: '// code', confidence: 'med',
    source: null, notes: null, hasPreview: false,
    interpretedHtml: null, interpretFailed: false, interpretPending: false,
    ...overrides,
  };
}

describe('LibraryObjectList — Interpretations-Zustände', () => {
  it('interpretedHtml: iframe-Vorschau + gelbe Pille, kein Stub-Chip', () => {
    render(<LibraryObjectList items={[item({ interpretedHtml: '<div>A</div>' })]} picks={{}} />);
    fireEvent.click(screen.getByText('Avatar'));
    expect(screen.getByTitle('Vorschau: Avatar')).toBeTruthy();
    expect(screen.getByText('von KI interpretiert')).toBeTruthy();
    expect(screen.queryByText('generischer Stub')).toBeNull();
  });

  it('pending: zeigt „Wird interpretiert …" und keinen Stub-Chip', () => {
    render(<LibraryObjectList items={[item({ interpretPending: true })]} picks={{}} />);
    fireEvent.click(screen.getByText('Avatar'));
    expect(screen.getByText(/Wird interpretiert/)).toBeTruthy();
    expect(screen.queryByText('generischer Stub')).toBeNull();
  });

  it('failed: Fehlerzeile + „Erneut versuchen" ruft onRetryInterpret mit dem Namen der Zeile, kein Stub-Chip', () => {
    const retry = vi.fn();
    render(
      <LibraryObjectList
        items={[item({ interpretFailed: true })]}
        picks={{}}
        onRetryInterpret={retry}
      />
    );
    fireEvent.click(screen.getByText('Avatar'));
    expect(screen.getByText(/Interpretation fehlgeschlagen/)).toBeTruthy();
    expect(screen.queryByText('generischer Stub')).toBeNull();
    fireEvent.click(screen.getByText('Erneut versuchen'));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(retry).toHaveBeenCalledWith('Avatar');
  });

  it('settled ohne Interpretation (weder pending noch failed): zeigt den generischen-Stub-Chip', () => {
    render(<LibraryObjectList items={[item()]} picks={{}} />);
    expect(screen.getByText('generischer Stub')).toBeTruthy();
  });

  it('Template-Vorschau bleibt Vorrang (hasPreview schlägt interpretedHtml)', () => {
    render(
      <LibraryObjectList
        items={[item({ hasPreview: true, templateKey: 'button', interpretedHtml: '<div>x</div>', variants: ['primary'] })]}
        picks={{}}
      />
    );
    fireEvent.click(screen.getByText('Avatar'));
    expect(screen.queryByTitle('Vorschau: Avatar')).toBeNull();
  });

  it('gehobener Baustein ohne Vorschau zeigt Pille + Interpret-Knopf', () => {
    const onRetryInterpret = vi.fn();
    const items = [{
      name: 'PricingWidget', slug: 'pricing-widget', kind: 'organism', filename: 'PricingWidget.tsx',
      code: 'export const PricingWidget = () => <div/>;', confidence: 'low', source: 'rules',
      lifted: true, variants: [], hasPreview: false, interpretedHtml: null,
      interpretFailed: false, interpretPending: false,
    }];
    render(<LibraryObjectList items={items} picks={{}} onRetryInterpret={onRetryInterpret} />);
    // Pille ist im Kopf (immer sichtbar):
    expect(screen.getByText('aus Repo gehoben')).toBeInTheDocument();
    // gehobener Code ist echte Quelle, kein Stub:
    expect(screen.queryByText('generischer Stub')).not.toBeInTheDocument();
    // Row aufklappen, dann Knopf klicken:
    fireEvent.click(screen.getByText('PricingWidget'));
    fireEvent.click(screen.getByRole('button', { name: /Mit KI interpretieren/ }));
    expect(onRetryInterpret).toHaveBeenCalledWith('PricingWidget');
  });

  it('interpretedDemo: zeigt die Demo-Daten-Pille, kein Modell-Tag', () => {
    render(
      <LibraryObjectList
        items={[item({ interpretedHtml: '<div>A</div>', interpretedDemo: true, interpretedModel: 'gemini-3-flash-preview' })]}
        picks={{}}
      />
    );
    expect(screen.getByText('Demo-Daten')).toBeInTheDocument();
    expect(screen.queryByText('gemini-3-flash-preview')).not.toBeInTheDocument();
  });

  it('interpretedModel ohne Demo: zeigt den Modell-Tag im Kopf', () => {
    render(
      <LibraryObjectList
        items={[item({ interpretedHtml: '<div>A</div>', interpretedModel: 'gemini-3-flash-preview' })]}
        picks={{}}
      />
    );
    expect(screen.getByText('gemini-3-flash-preview')).toBeInTheDocument();
    expect(screen.queryByText('Demo-Daten')).not.toBeInTheDocument();
  });

  it('interpretedModel null (alter Cache-Eintrag): rendert weder Modell-Tag noch Demo-Pille', () => {
    render(<LibraryObjectList items={[item({ interpretedHtml: '<div>A</div>' })]} picks={{}} />);
    expect(screen.queryByText('Demo-Daten')).not.toBeInTheDocument();
    expect(screen.queryByText(/gemini/)).not.toBeInTheDocument();
  });
});

describe('LibraryObjectList — Retry-Ladezustand pro Zeile', () => {
  it('retryingNames enthält den Item-Namen: Button disabled + „Wird erneut interpretiert …", kein "fehlgeschlagen"-Text, Button-Label „Läuft …" (Fix 2)', () => {
    const onRetryInterpret = vi.fn();
    render(
      <LibraryObjectList
        items={[item({ interpretFailed: true })]}
        picks={{}}
        onRetryInterpret={onRetryInterpret}
        retryingNames={new Set(['Avatar'])}
      />
    );
    fireEvent.click(screen.getByText('Avatar'));
    expect(screen.getByText(/Wird erneut interpretiert/)).toBeTruthy();
    expect(screen.queryByText(/Interpretation fehlgeschlagen/)).toBeNull();
    // Fix 2: Button zeigt "Läuft …" statt "Erneut versuchen", solange die Zeile retried.
    const button = screen.getByRole('button', { name: 'Läuft …' });
    expect(button).toBeDisabled();
  });

  it('batchPending (Batch läuft noch): Button disabled + „Interpretation läuft noch — Retry gleich möglich …"', () => {
    const onRetryInterpret = vi.fn();
    render(
      <LibraryObjectList
        items={[item({ interpretFailed: true })]}
        picks={{}}
        onRetryInterpret={onRetryInterpret}
        batchPending
      />
    );
    fireEvent.click(screen.getByText('Avatar'));
    expect(screen.getByText(/Interpretation läuft noch — Retry gleich möglich/)).toBeTruthy();
    expect(screen.queryByText(/Interpretation fehlgeschlagen/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeDisabled();
  });

  it('weder retryingNames noch batchPending: aktiver Button + „Interpretation fehlgeschlagen."', () => {
    const onRetryInterpret = vi.fn();
    render(
      <LibraryObjectList
        items={[item({ interpretFailed: true })]}
        picks={{}}
        onRetryInterpret={onRetryInterpret}
      />
    );
    fireEvent.click(screen.getByText('Avatar'));
    expect(screen.getByText('Interpretation fehlgeschlagen.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).not.toBeDisabled();
  });

  it('gehobener Baustein: batchPending sperrt auch den "Mit KI interpretieren"-Knopf', () => {
    const onRetryInterpret = vi.fn();
    const items = [{
      name: 'PricingWidget', slug: 'pricing-widget', kind: 'organism', filename: 'PricingWidget.tsx',
      code: 'export const PricingWidget = () => <div/>;', confidence: 'low', source: 'rules',
      lifted: true, variants: [], hasPreview: false, interpretedHtml: null,
      interpretFailed: false, interpretPending: false,
    }];
    render(<LibraryObjectList items={items} picks={{}} onRetryInterpret={onRetryInterpret} batchPending />);
    fireEvent.click(screen.getByText('PricingWidget'));
    expect(screen.getByRole('button', { name: /Mit KI interpretieren/ })).toBeDisabled();
  });

  it('gehobener Baustein: retryingNames sperrt den Knopf und zeigt "Läuft …" (Fix 2 — Label wechselt während des Retries)', () => {
    const onRetryInterpret = vi.fn();
    const items = [{
      name: 'PricingWidget', slug: 'pricing-widget', kind: 'organism', filename: 'PricingWidget.tsx',
      code: 'export const PricingWidget = () => <div/>;', confidence: 'low', source: 'rules',
      lifted: true, variants: [], hasPreview: false, interpretedHtml: null,
      interpretFailed: false, interpretPending: false,
    }];
    render(
      <LibraryObjectList
        items={items}
        picks={{}}
        onRetryInterpret={onRetryInterpret}
        retryingNames={new Set(['PricingWidget'])}
      />
    );
    fireEvent.click(screen.getByText('PricingWidget'));
    expect(screen.queryByRole('button', { name: /Mit KI interpretieren/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Läuft …' })).toBeDisabled();
  });
});

const liftedItem = (overrides = {}) => ({
  name: 'PricingWidget', slug: 'pricing-widget', kind: 'organism', filename: 'PricingWidget.tsx',
  code: 'export const PricingWidget = () => <div/>;', confidence: 'low', source: 'rules',
  lifted: true, variants: [], hasPreview: false, interpretedHtml: null,
  interpretFailed: false, interpretPending: false,
  ...overrides,
});

describe('LibraryObjectList — Fix 1: echte Fehlermeldung + Quota-Sperre an der Zeile', () => {
  it('quotaExhausted: Zeile zeigt die Server-Meldung aus interpretError, beide Button-Typen disabled mit title', () => {
    const onRetryInterpret = vi.fn();
    render(
      <LibraryObjectList
        items={[item({ interpretFailed: true }), liftedItem()]}
        picks={{}}
        onRetryInterpret={onRetryInterpret}
        interpretError="Tages-Kontingent erschöpft (RPD)."
        quotaExhausted
      />
    );
    fireEvent.click(screen.getByText('Avatar'));
    expect(screen.getByText('Tages-Kontingent erschöpft (RPD).')).toBeInTheDocument();
    const retryButton = screen.getByRole('button', { name: 'Erneut versuchen' });
    expect(retryButton).toBeDisabled();
    expect(retryButton).toHaveAttribute('title', 'Tages-Kontingent erschöpft (RPD).');

    fireEvent.click(screen.getByText('PricingWidget'));
    const interpretButton = screen.getByRole('button', { name: /Mit KI interpretieren/ });
    expect(interpretButton).toBeDisabled();
    expect(interpretButton).toHaveAttribute('title', 'Tages-Kontingent erschöpft (RPD).');
  });

  it('quotaExhausted ohne interpretError: zeigt den deutschen Fallback-Text mit Reset-Hinweis', () => {
    render(
      <LibraryObjectList
        items={[item({ interpretFailed: true })]}
        picks={{}}
        onRetryInterpret={vi.fn()}
        quotaExhausted
      />
    );
    fireEvent.click(screen.getByText('Avatar'));
    expect(
      screen.getByText('Tages-Kontingent der KI ist aufgebraucht — Reset ca. 09:00 deutscher Zeit.')
    ).toBeInTheDocument();
  });

  it('interpretError ohne Quota: Meldungstext enthält die echte Fehlermeldung, Button bleibt aktiv', () => {
    render(
      <LibraryObjectList
        items={[item({ interpretFailed: true })]}
        picks={{}}
        onRetryInterpret={vi.fn()}
        interpretError="Netzwerkfehler beim Interpretieren"
      />
    );
    fireEvent.click(screen.getByText('Avatar'));
    expect(
      screen.getByText('Interpretation fehlgeschlagen: Netzwerkfehler beim Interpretieren')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).not.toBeDisabled();
  });

  it('weder interpretError noch quotaExhausted: unveränderter generischer Text', () => {
    render(
      <LibraryObjectList items={[item({ interpretFailed: true })]} picks={{}} onRetryInterpret={vi.fn()} />
    );
    fireEvent.click(screen.getByText('Avatar'));
    expect(screen.getByText('Interpretation fehlgeschlagen.')).toBeInTheDocument();
  });
});

describe('LibraryObjectList — Fix 2: sichtbare Retry-Aktivität', () => {
  it('retrying: Spinner im Detail (Status-Zeile) UND im zugeklappten Header', () => {
    render(
      <LibraryObjectList
        items={[item({ interpretFailed: true })]}
        picks={{}}
        onRetryInterpret={vi.fn()}
        retryingNames={new Set(['Avatar'])}
      />
    );
    // Header-Pille sichtbar auch OHNE die Zeile aufzuklappen:
    expect(screen.getByText(/interpretiert …/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Avatar'));
    // Mind. zwei Spinner: Header-Pille + Detail-Statuszeile.
    expect(screen.getAllByRole('status').length).toBeGreaterThanOrEqual(2);
  });

  it('batchPending + offener Baustein (keine Interpretation, keine Vorschau): Header-Pille "interpretiert …" sichtbar', () => {
    render(<LibraryObjectList items={[item()]} picks={{}} batchPending />);
    expect(screen.getByText(/interpretiert …/)).toBeInTheDocument();
  });

  it('interpretierter Baustein bei batchPending: KEINE Header-Pille', () => {
    render(
      <LibraryObjectList items={[item({ interpretedHtml: '<div>A</div>' })]} picks={{}} batchPending />
    );
    expect(screen.queryByText(/interpretiert …/)).not.toBeInTheDocument();
  });

  it('Baustein mit Template-Vorschau bei batchPending: KEINE Header-Pille', () => {
    render(
      <LibraryObjectList
        items={[{ ...item(), hasPreview: true, templateKey: 'button', variants: ['primary'] }]}
        picks={{}}
        batchPending
      />
    );
    expect(screen.queryByText(/interpretiert …/)).not.toBeInTheDocument();
  });

  it('retrying: Vorschau-Bereich zeigt "Wird interpretiert …" mit Spinner statt "keine Vorschau"', () => {
    render(
      <LibraryObjectList
        items={[item({ interpretFailed: true })]}
        picks={{}}
        onRetryInterpret={vi.fn()}
        retryingNames={new Set(['Avatar'])}
      />
    );
    fireEvent.click(screen.getByText('Avatar'));
    expect(screen.getByText('Wird interpretiert …')).toBeInTheDocument();
    expect(screen.queryByText('keine Vorschau')).not.toBeInTheDocument();
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });
});

describe('LibraryObjectList — Herkunft (Task 6: partOf + instanceCount)', () => {
  it('zeigt Herkunft und Instanzzahl für herausgezogene Bausteine', () => {
    const items = [{ name: 'Nav Item', slug: 'nav-item', filename: 'NavItem.jsx', kind: 'molecule',
      templateKey: null, variants: [], code: '', confidence: 'high', hasPreview: false,
      instanceCount: 9, partOf: 'Sidebar' }];
    render(<LibraryObjectList items={items} picks={picks} />);
    expect(screen.getByText(/Teil von Sidebar/)).toBeInTheDocument();
    expect(screen.getByText(/×9/)).toBeInTheDocument();
  });

  it('zeigt kein Herkunfts-Label für Top-Level-Bausteine', () => {
    const items = [{ name: 'Logo', slug: 'logo', filename: 'Logo.jsx', kind: 'atom',
      templateKey: null, variants: [], code: '', confidence: 'high', hasPreview: false,
      instanceCount: 1, partOf: null }];
    render(<LibraryObjectList items={items} picks={picks} />);
    expect(screen.queryByText(/Teil von/)).not.toBeInTheDocument();
    expect(screen.queryByText(/×/)).not.toBeInTheDocument();
  });
});
