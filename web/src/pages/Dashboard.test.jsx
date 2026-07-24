import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Dashboard, { describeSource } from './Dashboard.jsx';

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

  it('zeigt die echte Herkunft statt des rohen Import-Typs (Bild-Dateiname)', () => {
    render(<Dashboard result={{
      source: 'image', mocked: false,
      categories: [], raw: { meta: { image_filename: 'homepage-screenshot.png' } },
    }} />);
    expect(screen.getByText('Bild')).toBeInTheDocument();
    expect(screen.getByText('homepage-screenshot.png')).toBeInTheDocument();
  });

  it('zeigt die echte URL bei einem URL-Import', () => {
    render(<Dashboard result={{
      source: 'url', mocked: false,
      categories: [], raw: { meta: { source_url: 'https://acme-analytics.com/pricing' } },
    }} />);
    expect(screen.getByText('URL')).toBeInTheDocument();
    expect(screen.getByText('acme-analytics.com/pricing')).toBeInTheDocument();
  });

  it('zeigt owner/repo + branch bei einem Repo-Import', () => {
    render(<Dashboard result={{
      source: 'repo', mocked: false,
      categories: [], raw: { meta: { source_url: 'https://github.com/acme/design-system', branch: 'main' } },
    }} />);
    expect(screen.getByText('Repo')).toBeInTheDocument();
    expect(screen.getByText('acme/design-system · main')).toBeInTheDocument();
  });

  it('ohne Quelle (kein source-Feld) wird nichts angezeigt statt "Quelle: undefined"', () => {
    render(<Dashboard result={{ categories: [], raw: null }} />);
    expect(screen.queryByText(/Quelle/)).not.toBeInTheDocument();
  });
});

describe('describeSource', () => {
  it('image: Dateiname aus meta.image_filename', () => {
    expect(describeSource({ source: 'image', raw: { meta: { image_filename: 'a.png' } } }))
      .toEqual({ label: 'Bild', value: 'a.png' });
  });

  it('url: Protokoll/www gestrippt', () => {
    expect(describeSource({ source: 'url', raw: { meta: { source_url: 'https://www.example.com/x' } } }))
      .toEqual({ label: 'URL', value: 'example.com/x' });
  });

  it('repo: github.com-Präfix entfernt, Branch angehängt', () => {
    expect(describeSource({ source: 'repo', raw: { meta: { source_url: 'https://github.com/foo/bar', branch: 'dev' } } }))
      .toEqual({ label: 'Repo', value: 'foo/bar · dev' });
  });

  it('repo ohne Branch: kein " · " angehängt', () => {
    expect(describeSource({ source: 'repo', raw: { meta: { source_url: 'https://github.com/foo/bar' } } }))
      .toEqual({ label: 'Repo', value: 'foo/bar' });
  });

  it('figma: source_url gestrippt wie url', () => {
    expect(describeSource({ source: 'figma', raw: { meta: { source_url: 'https://figma.com/design/abc' } } }))
      .toEqual({ label: 'Figma', value: 'figma.com/design/abc' });
  });

  it('kein meta/source_url → label ohne Value', () => {
    expect(describeSource({ source: 'url', raw: null })).toEqual({ label: 'URL', value: null });
  });

  it('kein source-Feld → label null (Element wird ausgeblendet)', () => {
    expect(describeSource({})).toEqual({ label: null, value: null });
    expect(describeSource(null)).toEqual({ label: null, value: null });
  });
});
