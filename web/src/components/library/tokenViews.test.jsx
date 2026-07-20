import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ColorSwatch, SpacingRow } from './tokenViews.jsx';

describe('token provenance line', () => {
  it('shows the CSS source (without -- prefix) when present', () => {
    render(<ColorSwatch color={{ hex: '#022d2c', role: 'primary', confidence: 'high', source: '--color-primary' }} />);
    expect(screen.getByText(/color-primary/)).toBeInTheDocument();
    expect(screen.getByText('CSS')).toBeInTheDocument();
    // das rohe CSS-Custom-Property-Präfix wird in der Anzeige weggelassen
    expect(screen.queryByText(/--color-primary/)).not.toBeInTheDocument();
  });

  it('omits the line when source is absent', () => {
    render(<ColorSwatch color={{ hex: '#022d2c', role: 'primary', confidence: 'high' }} />);
    expect(screen.queryByText('CSS')).not.toBeInTheDocument();
  });

  it('renders source on a spacing row too', () => {
    render(<ul><SpacingRow item={{ value: 16, usage: '4', confidence: 'high', source: '--space-4' }} /></ul>);
    expect(screen.getByText(/space-4/)).toBeInTheDocument();
  });
});
