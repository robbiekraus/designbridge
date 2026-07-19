import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FigmaTab from './FigmaTab.jsx';

function mockStatus(tokenConfigured) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ tokenConfigured }),
  });
}

beforeEach(() => {
  global.fetch = vi.fn();
});

describe('FigmaTab', () => {
  it('fetches /api/figma/status on mount and shows a token-configured message when true', async () => {
    mockStatus(true);
    render(<FigmaTab onSubmit={() => {}} />);
    expect(global.fetch).toHaveBeenCalledWith('/api/figma/status');
    expect(await screen.findByText(/Figma-Token gesetzt/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('figd_...')).toBeNull();
  });

  it('shows a token field, help link and privacy hint when tokenConfigured is false', async () => {
    mockStatus(false);
    render(<FigmaTab onSubmit={() => {}} />);
    expect(await screen.findByPlaceholderText('figd_...')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Token hier erstellen/i });
    expect(link).toHaveAttribute('href', 'https://www.figma.com/developers/api#access-tokens');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
    expect(screen.getByText(/nicht gespeichert/i)).toBeInTheDocument();
  });

  it('shows the helper line about styles/tokens and components/frames', async () => {
    mockStatus(true);
    render(<FigmaTab onSubmit={() => {}} />);
    await screen.findByText(/Figma-Token gesetzt/i);
    expect(screen.getByText(/Variables nur bei Enterprise/i)).toBeInTheDocument();
  });

  it('disables Import when the URL is empty', async () => {
    mockStatus(true);
    render(<FigmaTab onSubmit={() => {}} />);
    await screen.findByText(/Figma-Token gesetzt/i);
    expect(screen.getByRole('button', { name: /^Import$/ })).toBeDisabled();
  });

  it('disables Import for an invalid figma URL', async () => {
    mockStatus(true);
    render(<FigmaTab onSubmit={() => {}} />);
    await screen.findByText(/Figma-Token gesetzt/i);
    await userEvent.type(screen.getByPlaceholderText(/figma\.com\/design/i), 'https://acme.com/not-figma');
    expect(screen.getByRole('button', { name: /^Import$/ })).toBeDisabled();
  });

  it('enables Import for a valid figma URL when a server token is configured', async () => {
    mockStatus(true);
    render(<FigmaTab onSubmit={() => {}} />);
    await screen.findByText(/Figma-Token gesetzt/i);
    await userEvent.type(screen.getByPlaceholderText(/figma\.com\/design/i), 'https://www.figma.com/design/abc123/My-File');
    expect(screen.getByRole('button', { name: /^Import$/ })).not.toBeDisabled();
  });

  it('keeps Import disabled without a server token until the token field is filled', async () => {
    mockStatus(false);
    render(<FigmaTab onSubmit={() => {}} />);
    await screen.findByPlaceholderText('figd_...');
    await userEvent.type(screen.getByPlaceholderText(/figma\.com\/design/i), 'https://www.figma.com/design/abc123/My-File');
    expect(screen.getByRole('button', { name: /^Import$/ })).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText('figd_...'), 'figd_secret');
    expect(screen.getByRole('button', { name: /^Import$/ })).not.toBeDisabled();
  });

  it('accepts a figma.com/file/... URL as valid too', async () => {
    mockStatus(true);
    render(<FigmaTab onSubmit={() => {}} />);
    await screen.findByText(/Figma-Token gesetzt/i);
    await userEvent.type(screen.getByPlaceholderText(/figma\.com\/design/i), 'https://www.figma.com/file/abc123/My-File');
    expect(screen.getByRole('button', { name: /^Import$/ })).not.toBeDisabled();
  });

  it('calls onSubmit with an empty token when a server token is configured', async () => {
    mockStatus(true);
    const onSubmit = vi.fn();
    render(<FigmaTab onSubmit={onSubmit} />);
    await screen.findByText(/Figma-Token gesetzt/i);
    await userEvent.type(screen.getByPlaceholderText(/figma\.com\/design/i), 'https://www.figma.com/design/abc123/My-File');
    await userEvent.click(screen.getByRole('button', { name: /^Import$/ }));
    expect(onSubmit).toHaveBeenCalledWith({
      source: 'figma',
      payload: { url: 'https://www.figma.com/design/abc123/My-File', token: '' },
    });
  });

  it('calls onSubmit with the entered token when no server token is configured', async () => {
    mockStatus(false);
    const onSubmit = vi.fn();
    render(<FigmaTab onSubmit={onSubmit} />);
    await screen.findByPlaceholderText('figd_...');
    await userEvent.type(screen.getByPlaceholderText(/figma\.com\/design/i), 'https://www.figma.com/design/abc123/My-File');
    await userEvent.type(screen.getByPlaceholderText('figd_...'), 'figd_secret');
    await userEvent.click(screen.getByRole('button', { name: /^Import$/ }));
    expect(onSubmit).toHaveBeenCalledWith({
      source: 'figma',
      payload: { url: 'https://www.figma.com/design/abc123/My-File', token: 'figd_secret' },
    });
  });

  it('respects an explicit disabled prop', async () => {
    mockStatus(true);
    render(<FigmaTab onSubmit={() => {}} disabled />);
    await screen.findByText(/Figma-Token gesetzt/i);
    await userEvent.type(screen.getByPlaceholderText(/figma\.com\/design/i), 'https://www.figma.com/design/abc123/My-File');
    expect(screen.getByRole('button', { name: /^Import$/ })).toBeDisabled();
  });
});
