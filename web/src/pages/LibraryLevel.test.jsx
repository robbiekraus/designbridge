import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LibraryLevel from './LibraryLevel.jsx';

const emptyRaw = {
  tokens: { colors: [], typography: [], spacing: [], border_radius: [], shadows: [] },
  atoms: [], molecules: [], organisms: [], templates: [],
};

describe('LibraryLevel page', () => {
  it('shows the preview-import notice when there is no detail', () => {
    render(<LibraryLevel result={{ raw: null }} kind="atom" title="Atoms" />);
    expect(screen.getByText(/preview-import/i)).toBeInTheDocument();
  });

  // Neuer Test (Spec §Tests c): die generische Seite muss für ALLE 4 kinds
  // rendern — je Ebene ihren jeweiligen raw-Bucket lesen und die Items zeigen.
  it.each([
    ['atom', 'atoms'],
    ['molecule', 'molecules'],
    ['organism', 'organisms'],
    ['template', 'templates'],
  ])('renders items for kind=%s from raw.%s', (kind, bucketKey) => {
    const result = { raw: { ...emptyRaw, [bucketKey]: [{ name: 'Thing', variants: [], confidence: 'high' }] } };
    render(<LibraryLevel result={result} kind={kind} title="X" />);
    expect(screen.getByText('Thing')).toBeInTheDocument();
  });

  it('lists a recognized atom and expands to show the variant switcher', () => {
    const result = { raw: { ...emptyRaw, atoms: [{ name: 'Button', variants: ['primary'], confidence: 'high' }] } };
    render(<LibraryLevel result={result} kind="atom" title="Atoms" />);
    expect(screen.getByText('Button')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Button'));
    expect(screen.getByRole('button', { name: 'primary' })).toBeInTheDocument();
  });
});
