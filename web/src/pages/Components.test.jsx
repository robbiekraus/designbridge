import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Components from './Components.jsx';

describe('Components page', () => {
  it('shows the preview-import notice when there is no detail', () => {
    render(<Components result={{ raw: null }} />);
    expect(screen.getByText(/preview-import/i)).toBeInTheDocument();
  });

  it('lists recognized components in the accordion', () => {
    const result = { raw: {
      tokens: { colors: [], typography: [], spacing: [], border_radius: [], shadows: [] },
      atomics: [], patterns: [],
      components: [{ name: 'Button', variants: ['primary'], confidence: 'high' }],
    } };
    render(<Components result={result} />);
    expect(screen.getByText('Button')).toBeInTheDocument();
  });
});
