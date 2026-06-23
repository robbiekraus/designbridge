import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Dashboard from './Dashboard.jsx';

const imageResult = {
  source: 'image', mocked: false,
  categories: [{ key: 'colors', label: 'Colors', count: 11, confidence: 'high' }],
  raw: {
    summary: { source_description: 'A SaaS dashboard', app_type: 'SaaS dashboard', color_mode: 'light', design_style: 'minimal' },
    warnings: ['Motion tokens cannot be inferred'],
  },
};

describe('Dashboard page', () => {
  it('shows the summary and category counts', () => {
    render(<Dashboard result={imageResult} />);
    expect(screen.getByText('A SaaS dashboard')).toBeInTheDocument();
    expect(screen.getByText('Colors')).toBeInTheDocument();
    expect(screen.getByText('11')).toBeInTheDocument();
    expect(screen.getByText(/motion tokens/i)).toBeInTheDocument();
  });

  it('shows a PREVIEW notice for a mock import', () => {
    render(<Dashboard result={{ source: 'url', mocked: true, categories: [{ key: 'colors', label: 'Colors', count: 11, confidence: 'med' }], raw: null }} />);
    expect(screen.getByText('PREVIEW')).toBeInTheDocument();
  });
});
