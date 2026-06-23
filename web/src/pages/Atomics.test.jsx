import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Atomics from './Atomics.jsx';

const result = {
  source: 'image', mocked: false, categories: [],
  raw: { atomics: [{ name: 'Button', variants: ['primary', 'ghost'], confidence: 'high', notes: 'rounded' }] },
};

describe('Atomics page', () => {
  it('renders a card with name, variants and a reserved preview area', () => {
    render(<Atomics result={result} />);
    expect(screen.getByText('Button')).toBeInTheDocument();
    expect(screen.getByText('primary')).toBeInTheDocument();
    expect(screen.getByText('ghost')).toBeInTheDocument();
    expect(screen.getByText(/vorschau folgt/i)).toBeInTheDocument();
  });

  it('shows a preview notice for a mock import', () => {
    render(<Atomics result={{ source: 'url', mocked: true, categories: [], raw: null }} />);
    expect(screen.getByText(/preview-import/i)).toBeInTheDocument();
  });
});
