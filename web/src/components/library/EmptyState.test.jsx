import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EmptyState from './EmptyState.jsx';

describe('EmptyState', () => {
  it('shows the empty message', () => {
    render(<EmptyState onNewImport={() => {}} />);
    expect(screen.getByText(/noch nichts importiert/i)).toBeInTheDocument();
  });

  it('calls onNewImport when the button is clicked', async () => {
    const onNewImport = vi.fn();
    render(<EmptyState onNewImport={onNewImport} />);
    await userEvent.click(screen.getByRole('button', { name: /neuer import/i }));
    expect(onNewImport).toHaveBeenCalledOnce();
  });

  it('renders the primary action button with the UIPrism primary color, not black', () => {
    render(<EmptyState onNewImport={() => {}} />);
    const button = screen.getByRole('button', { name: /neuer import/i });
    expect(button.className).toContain('bg-primary');
    expect(button.className).not.toContain('bg-zinc-900');
  });
});
