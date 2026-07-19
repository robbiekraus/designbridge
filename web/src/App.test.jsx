import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App.jsx';

describe('App header', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ json: async () => ({ ai_key_configured: true }) });
    localStorage.clear();
  });

  it('renders the UIPrism wordmark, not the old Designbridge name', () => {
    render(<App />);
    expect(screen.getByText('UI')).toBeInTheDocument();
    expect(screen.getByText('Prism')).toBeInTheDocument();
    expect(screen.queryByText(/Designbridge/i)).not.toBeInTheDocument();
  });

  it('renders the UIPrism brand mark image', () => {
    render(<App />);
    expect(screen.getByAltText('UIPrism')).toBeInTheDocument();
  });
});
