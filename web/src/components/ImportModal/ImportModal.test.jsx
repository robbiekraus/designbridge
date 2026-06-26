import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ImportModal from './ImportModal.jsx';

beforeEach(() => {
  global.fetch = vi.fn();
});

describe('ImportModal', () => {
  it('does not render when closed', () => {
    render(<ImportModal open={false} onClose={() => {}} />);
    expect(screen.queryByText('Start a new import')).toBeNull();
  });

  it('renders all four tabs when open', () => {
    render(<ImportModal open={true} onClose={() => {}} />);
    expect(screen.getByText('Start a new import')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Image/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^URL/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Repo/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Figma/ })).toBeInTheDocument();
  });

  it('disables the Figma tab', () => {
    render(<ImportModal open={true} onClose={() => {}} />);
    const figma = screen.getByRole('button', { name: /^Figma/ });
    expect(figma).toBeDisabled();
  });

  it('runs the URL import end to end', async () => {
    global.fetch.mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 200));
      return {
        ok: true,
        json: async () => ({
          tokens: {
            colors: [{ hex: '#fff', confidence: 'high' }],
            typography: [],
            spacing: [],
            border_radius: [],
            shadows: [],
          },
          atomics: [],
          components: [],
          patterns: [],
        }),
      };
    });

    const user = userEvent.setup();
    render(<ImportModal open={true} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /^URL/ }));
    await user.type(screen.getByPlaceholderText('https://example.com'), 'https://acme.com');
    await user.click(screen.getByRole('button', { name: /^Import$/ }));
    expect(await screen.findByText(/Extracting tokens/i, {}, { timeout: 3000 })).toBeInTheDocument();
    expect(await screen.findByText(/Extracted from url/i, {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText('Colors')).toBeInTheDocument();
  }, 5000);
});
