// web/src/components/library/InterpretedPreview.test.jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import InterpretedPreview, { buildSrcdoc } from './InterpretedPreview.jsx';
import { sourceLabel } from './SourcePill.jsx';

describe('buildSrcdoc', () => {
  it('bettet das HTML und die Tailwind-Laufzeit ein', () => {
    const doc = buildSrcdoc('<div class="p-2">Hi</div>');
    expect(doc).toContain('cdn.tailwindcss.com');
    expect(doc).toContain('<div class="p-2">Hi</div>');
    expect(doc.startsWith('<!doctype html>')).toBe(true);
  });
});

describe('InterpretedPreview', () => {
  it('rendert ein sandboxed iframe ohne same-origin', () => {
    render(<InterpretedPreview html='<div class="p-2">Hi</div>' title="Avatar" />);
    const frame = screen.getByTitle('Vorschau: Avatar');
    expect(frame.tagName).toBe('IFRAME');
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    expect(frame.getAttribute('srcdoc')).toContain('Hi');
  });
});

describe('SourcePill "interpreted"', () => {
  it('kennt die gelbe Pille „von KI interpretiert"', () => {
    const m = sourceLabel('interpreted');
    expect(m.label).toBe('von KI interpretiert');
    expect(m.cls).toContain('amber');
  });
});
