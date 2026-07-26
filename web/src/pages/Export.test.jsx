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

// Baustein ohne Template-Treffer und ohne KI-Interpretation → landet als
// placeholder:true im exports.figma-Payload (siehe emitFigmaComponents.js).
const placeholderResult = {
  source: 'image', mocked: false, raw: {
    tokens: {
      colors: [{ hex: '#022d2c', role: 'primary button', confidence: 'high' }],
      typography: [], spacing: [], border_radius: [], shadows: [],
    },
    atoms: [{ name: 'Category Of Emissions Chart', variants: [], confidence: 'low', source: 'ai', notes: null }],
    molecules: [], organisms: [], templates: [],
  },
};

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

  it('offers an active Storybook export button', () => {
    render(<Export result={imageResult} />);
    const btn = screen.getByRole('button', { name: /nach storybook exportieren/i });
    expect(btn).toBeEnabled();
    expect(btn).toHaveAttribute('title', expect.stringMatching(/handoff-paket/i));
  });

  it('shows an amber placeholder warning naming the affected Baustein when the Figma payload contains placeholders', () => {
    render(<Export result={placeholderResult} />);
    const warning = screen.getByTestId('export-figma-placeholder-warning');
    expect(warning).toBeInTheDocument();
    expect(warning.textContent).toContain('1');
    expect(warning.textContent).toContain('Category Of Emissions Chart');
    expect(warning.textContent).toMatch(/platzhalter-karte/i);
  });

  it('does not show the placeholder warning when the Figma payload has no placeholders', () => {
    render(<Export result={imageResult} />);
    expect(screen.queryByTestId('export-figma-placeholder-warning')).not.toBeInTheDocument();
  });

  it('shows a scope hint about what goes to Figma vs. code formats', () => {
    render(<Export result={imageResult} />);
    expect(screen.getByText(/nach figma gehen farben & textstile/i)).toBeInTheDocument();
  });

  it('expands the Figma JSON preview when "JSON anzeigen" is clicked', () => {
    render(<Export result={imageResult} />);
    expect(screen.queryByTestId('export-figma-json-preview')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'JSON anzeigen' }));

    const preview = screen.getByTestId('export-figma-json-preview');
    expect(preview).toBeInTheDocument();
    expect(preview.textContent).toContain('figma-import');
  });

  it('bietet einen Live-Preview-Button, der die Bausteine an den Storybook-Builder schickt und das Ergebnis öffnet', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'abc123', url: '/preview/abc123/' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const openMock = vi.fn();
    vi.stubGlobal('open', openMock);

    render(<Export result={placeholderResult} />);
    fireEvent.click(screen.getByRole('button', { name: /in storybook öffnen/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/build$/);
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    // placeholderResult hat einen echten Atom-Baustein — components/stories dürfen nicht leer
    // sein, sonst prüft dieser Test nur das leere JSON.stringify-Skelett, nie die Präfix-Trennung.
    expect(Object.keys(body.components)).toContain('CategoryOfEmissionsChart.jsx');
    expect(Object.keys(body.stories)).toContain('CategoryOfEmissionsChart.stories.jsx');
    expect(body.components['CategoryOfEmissionsChart.jsx']).not.toMatch(/^components\//);

    await waitFor(() => expect(openMock).toHaveBeenCalledWith(expect.stringContaining('/preview/abc123/'), '_blank'));

    vi.unstubAllGlobals();
  });

  // Live-Fund 25.07.: Klassen wie `bg-background-card` waren im Empfangs-Storybook nicht
  // definiert, weil dessen Tailwind-Config die Scan-Tokens nicht kannte — der Build-Request
  // muss sie deshalb mitschicken.
  it('schickt die Scan-Tokens (tailwind.tokens.js/tokens.css) im Build-Request mit', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'abc123', url: '/preview/abc123/' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('open', vi.fn());

    render(<Export result={placeholderResult} />);
    fireEvent.click(screen.getByRole('button', { name: /in storybook öffnen/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.tokens).toContain('export default {');
    expect(body.tokens).toContain('primary-button');
    expect(body.tokensCss).toContain('--color-primary-button: #022d2c;');

    vi.unstubAllGlobals();
  });

  // Live-Fund 26.07.: Ergebnisse ohne verwertbare Bausteine (emitComponents → []) schickten
  // eine leere Lieferung raus. Der Builder antwortete korrekt mit 400, die UI zeigte aber
  // „bitte nochmal versuchen" — ein Neuversuch kann hier prinzipiell nie helfen.
  it('schickt gar nichts los, wenn der Import keine Bausteine enthält, und sagt warum', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<Export result={imageResult} />);
    const button = screen.getByRole('button', { name: /in storybook öffnen/i });
    expect(button).toBeDisabled();
    expect(screen.getByText(/keine Bausteine/i)).toBeInTheDocument();

    fireEvent.click(button);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/nochmal versuchen/i)).not.toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  // Der Build läuft in Prod ~9 s. Wird der Tab erst NACH dem await geöffnet, ist die
  // Nutzergeste abgelaufen und der Popup-Blocker verwirft ihn — der Klick tut dann nichts.
  it('öffnet den Tab synchron beim Klick, nicht erst nach dem Build', async () => {
    const tab = { location: null, close: vi.fn() };
    const openMock = vi.fn().mockReturnValue(tab);
    vi.stubGlobal('open', openMock);
    let resolveFetch;
    vi.stubGlobal('fetch', vi.fn(() => new Promise((r) => { resolveFetch = r; })));

    render(<Export result={placeholderResult} storybookBuilderUrl="https://harness.example.app" />);
    fireEvent.click(screen.getByRole('button', { name: /in storybook öffnen/i }));

    // Noch bevor der Build antwortet, muss der Tab schon offen sein.
    expect(openMock).toHaveBeenCalledWith('', '_blank');

    resolveFetch({ ok: true, json: async () => ({ id: 'abc', url: '/preview/abc/' }) });
    await waitFor(() => expect(tab.location).toBe('https://harness.example.app/preview/abc/'));

    vi.unstubAllGlobals();
  });

  it('zeigt eine ehrliche Fehlermeldung, wenn der Storybook-Builder nicht antwortet', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    render(<Export result={placeholderResult} />);
    fireEvent.click(screen.getByRole('button', { name: /in storybook öffnen/i }));

    await waitFor(() => expect(screen.getByText(/konnte nicht gebaut werden/i)).toBeInTheDocument());

    vi.unstubAllGlobals();
  });

  // Regressionsschutz für den Live-Fund 25.07.: die Builder-Adresse kam als ins Bundle
  // gebackene VITE_-Variable und fehlte still, wenn sie erst nach dem Build gesetzt wurde
  // — der Klick ging dann gegen localhost statt gegen den echten Dienst.
  it('schickt den Build an die vom Server gelieferte Laufzeit-Adresse, nicht an localhost', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'xyz789', url: '/preview/xyz789/' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const openMock = vi.fn();
    vi.stubGlobal('open', openMock);

    render(<Export result={placeholderResult} storybookBuilderUrl="https://harness.example.app" />);
    fireEvent.click(screen.getByRole('button', { name: /in storybook öffnen/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe('https://harness.example.app/build');
    await waitFor(() =>
      expect(openMock).toHaveBeenCalledWith('https://harness.example.app/preview/xyz789/', '_blank'),
    );

    vi.unstubAllGlobals();
  });

  // Die schwarzen Haupt-Buttons müssen in allen drei Ziel-Karten auf derselben
  // Höhe am unteren Rand bleiben. Statusmeldungen gehören deshalb VOR den Button —
  // liegt eine Meldung dahinter, rutscht der Button in dieser Karte nach oben.
  it('hält den schwarzen Haupt-Button als letztes Element der Karte, auch bei Fehlermeldung', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    render(<Export result={placeholderResult} />);
    fireEvent.click(screen.getByRole('button', { name: /in storybook öffnen/i }));
    await waitFor(() => expect(screen.getByText(/konnte nicht gebaut werden/i)).toBeInTheDocument());

    const blackButton = screen.getByRole('button', { name: /nach storybook exportieren/i });
    expect(blackButton.parentElement.lastElementChild).toBe(blackButton);

    const figmaButton = screen.getByRole('button', { name: 'An Figma senden' });
    expect(figmaButton.parentElement.lastElementChild).toBe(figmaButton);

    vi.unstubAllGlobals();
  });
});
