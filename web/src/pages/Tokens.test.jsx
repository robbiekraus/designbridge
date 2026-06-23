// web/src/pages/Tokens.test.jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Tokens from './Tokens.jsx';

const imageResult = {
  source: 'image', mocked: false, categories: [],
  raw: {
    tokens: {
      colors: [{ hex: '#2563eb', role: 'accent', confidence: 'high' }],
      typography: [{ size: '24', weight: '700', role: 'heading-xl', sample: 'Dashboard', confidence: 'high' }],
      spacing: [{ value: '16', usage: 'card padding', confidence: 'medium' }],
      border_radius: [{ value: '8', usage: 'cards', confidence: 'high' }],
      shadows: [{ description: 'card-shadow', css: '0 1px 3px rgba(0,0,0,.1)', confidence: 'medium' }],
    },
  },
};

const mockResult = { source: 'url', mocked: true, categories: [], raw: null };

describe('Tokens page', () => {
  it('renders real token values for an image import', () => {
    render(<Tokens result={imageResult} />);
    expect(screen.getByText('#2563eb')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('card-shadow')).toBeInTheDocument();
  });

  it('shows a preview notice for a mock import', () => {
    render(<Tokens result={mockResult} />);
    expect(screen.getByText(/preview-import/i)).toBeInTheDocument();
  });
});
