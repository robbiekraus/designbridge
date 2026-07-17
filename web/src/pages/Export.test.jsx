import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

  it('no longer offers "Nach Figma (Plugin)" as a format list entry', () => {
    render(<Export result={imageResult} />);
    expect(screen.queryByRole('button', { name: 'Nach Figma (Plugin)' })).not.toBeInTheDocument();
  });

  it('switches the preview when another format is picked', () => {
    render(<Export result={imageResult} />);
    fireEvent.click(screen.getByRole('button', { name: 'tokens.json' }));
    expect(screen.getByTestId('export-preview').textContent).toContain('"$value": "#022d2c"');
  });

  it('offers a whole-library export action', () => {
    render(<Export result={imageResult} />);
    expect(screen.getByRole('button', { name: /ganze library exportieren/i })).toBeInTheDocument();
  });

  it('shows a Ziele section with a primary "An Figma senden" button that posts to the existing endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    render(<Export result={imageResult} />);

    expect(screen.getByText('Ziele')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'An Figma senden' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/figma-export',
      expect.objectContaining({ method: 'POST' })
    );
    await waitFor(() => expect(screen.getByText(/bereit — jetzt im plugin/i)).toBeInTheDocument());

    vi.unstubAllGlobals();
  });

  it('shows a disabled Storybook stub button', () => {
    render(<Export result={imageResult} />);
    const btn = screen.getByRole('button', { name: /nach storybook/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', 'Folgt in einer späteren Version');
  });

  it('expands the Figma JSON preview when "JSON anzeigen" is clicked', () => {
    render(<Export result={imageResult} />);
    expect(screen.queryByTestId('export-figma-json-preview')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'JSON anzeigen' }));

    const preview = screen.getByTestId('export-figma-json-preview');
    expect(preview).toBeInTheDocument();
    expect(preview.textContent).toContain('figma-import');
  });
});
