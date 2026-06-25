import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Atomics from './Atomics.jsx';

describe('Atomics page', () => {
  it('shows the preview-import notice when there is no detail', () => {
    render(<Atomics result={{ raw: null }} />);
    expect(screen.getByText(/preview-import/i)).toBeInTheDocument();
  });

  it('lists recognized atomics and expands to show the variant switcher', () => {
    const result = { raw: {
      tokens: { colors: [], typography: [], spacing: [], border_radius: [], shadows: [] },
      components: [], patterns: [],
      atomics: [{ name: 'Button', variants: ['primary'], confidence: 'high' }],
    } };
    render(<Atomics result={result} />);
    expect(screen.getByText('Button')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Button'));
    expect(screen.getByRole('button', { name: 'primary' })).toBeInTheDocument();
  });
});
