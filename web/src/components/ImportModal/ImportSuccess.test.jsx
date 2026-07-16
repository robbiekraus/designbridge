import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ImportSuccess from './ImportSuccess.jsx';

const sampleResult = {
  source: 'image',
  mocked: false,
  categories: [
    { key: 'colors', label: 'Colors', count: 14, confidence: 'high' },
    { key: 'typography', label: 'Typography', count: 6, confidence: 'high' },
    { key: 'spacing', label: 'Spacing', count: 8, confidence: 'med' },
    { key: 'radius', label: 'Border radius', count: 4, confidence: 'high' },
    { key: 'shadows', label: 'Shadows', count: 3, confidence: 'med' },
    {
      key: 'inventory', label: 'UI inventory', count: 12, confidence: 'med',
      extra: { atomics: 4, components: 5, patterns: 3 },
    },
  ],
  raw: null,
};

describe('ImportSuccess', () => {
  it('renders a row per category with count and confidence', () => {
    render(<ImportSuccess result={sampleResult} onNewImport={() => {}} />);
    expect(screen.getByText('Colors')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();
    expect(screen.getByText('Typography')).toBeInTheDocument();
    expect(screen.getByText('UI inventory')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText(/4 atomics/)).toBeInTheDocument();
    expect(screen.getByText(/5 components/)).toBeInTheDocument();
    expect(screen.getByText(/3 patterns/)).toBeInTheDocument();
  });

  it('shows the mocked badge only when mocked is true', () => {
    const { rerender } = render(<ImportSuccess result={sampleResult} onNewImport={() => {}} />);
    expect(screen.queryByText(/PREVIEW/i)).toBeNull();
    rerender(<ImportSuccess result={{ ...sampleResult, mocked: true }} onNewImport={() => {}} />);
    expect(screen.getByText(/PREVIEW/i)).toBeInTheDocument();
  });

  it('fires onNewImport when the button is clicked', async () => {
    const fn = vi.fn();
    render(<ImportSuccess result={sampleResult} onNewImport={fn} />);
    await userEvent.click(screen.getByRole('button', { name: /new import/i }));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('calls onOpenLibrary when "Open library" is clicked', async () => {
    const onOpenLibrary = vi.fn();
    const result = { source: 'image', mocked: false, categories: [], raw: {} };
    render(<ImportSuccess result={result} onNewImport={() => {}} onOpenLibrary={onOpenLibrary} />);
    await userEvent.click(screen.getByRole('button', { name: /open library/i }));
    expect(onOpenLibrary).toHaveBeenCalledOnce();
  });

  it('shows an amber warning state instead of the green checkmark when 0 tokens were extracted', () => {
    const zeroResult = {
      source: 'url',
      mocked: false,
      warnings: [],
      categories: [
        { key: 'colors', label: 'Colors', count: 0, confidence: null },
        { key: 'typography', label: 'Typography', count: 0, confidence: null },
        { key: 'spacing', label: 'Spacing', count: 0, confidence: null },
        { key: 'radius', label: 'Border radius', count: 0, confidence: null },
        { key: 'shadows', label: 'Shadows', count: 0, confidence: null },
        { key: 'inventory', label: 'UI inventory', count: 0, confidence: null, extra: { atomics: 0, components: 0, patterns: 0 } },
      ],
      raw: {},
    };
    render(<ImportSuccess result={zeroResult} onNewImport={() => {}} />);
    expect(screen.queryByText('✓')).toBeNull();
    expect(screen.getByText(/keine Design-Tokens gefunden/i)).toBeInTheDocument();
  });

  it('still shows the green checkmark when tokens were extracted, even with 0 inventory items', () => {
    render(<ImportSuccess result={sampleResult} onNewImport={() => {}} />);
    expect(screen.getByText('✓')).toBeInTheDocument();
  });

  it('renders server warnings from the scan response', () => {
    const withWarnings = {
      ...sampleResult,
      warnings: [
        '2 Stylesheet(s) waren nicht lesbar und wurden übersprungen — einzelne Tokens können fehlen.',
        'Tailwind 4 erkannt — Tokens werden aus CSS-Variablen statt tailwind.config gelesen.',
      ],
    };
    render(<ImportSuccess result={withWarnings} onNewImport={() => {}} />);
    expect(screen.getByText(/Stylesheet\(s\) waren nicht lesbar/i)).toBeInTheDocument();
    expect(screen.getByText(/Tailwind 4 erkannt/i)).toBeInTheDocument();
  });

  it('renders nothing extra when there are no warnings', () => {
    render(<ImportSuccess result={sampleResult} onNewImport={() => {}} />);
    expect(screen.queryByRole('list', { name: /hinweise/i })).toBeNull();
  });
});
