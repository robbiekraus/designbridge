import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UrlTab from './UrlTab.jsx';

describe('UrlTab', () => {
  it('shows no GitHub hint for a normal URL', async () => {
    render(<UrlTab onSubmit={() => {}} />);
    await userEvent.type(screen.getByPlaceholderText('https://example.com'), 'https://acme.com');
    expect(screen.queryByText(/GitHub/i)).toBeNull();
  });

  it('shows a German hint to use the Repo tab when a github.com URL is entered', async () => {
    render(<UrlTab onSubmit={() => {}} />);
    await userEvent.type(screen.getByPlaceholderText('https://example.com'), 'https://github.com/acme/repo');
    expect(screen.getByText(/Repo-Tab/i)).toBeInTheDocument();
  });

  it('does not block scanning a github.com URL — the Import button stays enabled', async () => {
    render(<UrlTab onSubmit={() => {}} />);
    await userEvent.type(screen.getByPlaceholderText('https://example.com'), 'https://github.com/acme/repo');
    expect(screen.getByRole('button', { name: /^Import$/ })).not.toBeDisabled();
  });

  it('offers a direct switch to the Repo tab when onSwitchToRepo is provided', async () => {
    const onSwitchToRepo = vi.fn();
    render(<UrlTab onSubmit={() => {}} onSwitchToRepo={onSwitchToRepo} />);
    await userEvent.type(screen.getByPlaceholderText('https://example.com'), 'https://github.com/acme/repo');
    await userEvent.click(screen.getByRole('button', { name: /Repo-Tab/i }));
    expect(onSwitchToRepo).toHaveBeenCalledTimes(1);
  });
});
