import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Export from './Export.jsx';

const imageResult = {
  source: 'image', mocked: false, raw: {
    tokens: {
      colors: [{ hex: '#022d2c', role: 'primary button', confidence: 'high' }],
      typography: [], spacing: [], border_radius: [], shadows: [],
    },
  },
};
const mockResult = { source: 'url', mocked: true, raw: null };

describe('Export page', () => {
  it('shows an empty notice when there is no token detail', () => {
    render(<Export result={mockResult} />);
    expect(screen.getByText(/importiere ein bild/i)).toBeInTheDocument();
  });

  it('renders the three format options and the CSS preview by default', () => {
    render(<Export result={imageResult} />);
    expect(screen.getByRole('button', { name: 'CSS-Variablen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tailwind-Config' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'tokens.json' })).toBeInTheDocument();
    expect(screen.getByTestId('export-preview').textContent).toContain('--color-primary-button: #022d2c;');
  });

  it('switches the preview when another format is picked', () => {
    render(<Export result={imageResult} />);
    fireEvent.click(screen.getByRole('button', { name: 'tokens.json' }));
    expect(screen.getByTestId('export-preview').textContent).toContain('"$value": "#022d2c"');
  });
});
