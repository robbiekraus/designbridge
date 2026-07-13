import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LibraryObjectList from './LibraryObjectList.jsx';

const picks = { primary: '#022d2c', onPrimary: '#ffffff', text: '#18181b',
  surface: '#ffffff', surfaceMuted: '#f4f4f5', border: '#e4e4e7', radius: '8px',
  fontSize: '16px', fontWeight: '600' };

const items = [
  { name: 'Button', slug: 'button', filename: 'Button.jsx', kind: 'atomic',
    templateKey: 'button', variants: ['primary', 'secondary', 'ghost'],
    code: 'export function Button() {}', confidence: 'high', hasPreview: true },
  { name: 'Hero section', slug: 'hero-section', filename: 'HeroSection.jsx', kind: 'component',
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
    name: 'Avatar', slug: 'avatar', filename: 'Avatar.jsx', kind: 'atomic',
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
});
