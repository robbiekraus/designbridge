// web/src/components/library/InterpretedPreview.test.jsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

describe('InterpretedPreview — Thumbnail', () => {
  it('rendert ein sandboxed Thumbnail-iframe ohne same-origin', () => {
    render(<InterpretedPreview html='<div class="p-2">Hi</div>' title="Avatar" />);
    const frame = screen.getByTitle('Vorschau: Avatar');
    expect(frame.tagName).toBe('IFRAME');
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    expect(frame.getAttribute('srcdoc')).toContain('Hi');
  });

  it('das Thumbnail-iframe hat einen scale-Transform-Style (top left origin)', () => {
    render(<InterpretedPreview html='<div>Hi</div>' title="Avatar" />);
    const frame = screen.getByTitle('Vorschau: Avatar');
    expect(frame.style.transform).toMatch(/scale\(/);
    expect(frame.style.transformOrigin).toBe('top left');
  });

  it('der Thumbnail-Wrapper hat overflow-hidden und eine feste Höhe', () => {
    render(<InterpretedPreview html='<div>Hi</div>' title="Avatar" />);
    const wrapper = screen.getByTestId('preview-thumb-wrapper');
    expect(wrapper.className).toMatch(/overflow-hidden/);
    expect(wrapper.style.height).not.toBe('');
  });

  it('Thumbnail ist als klickbarer Button mit deutschem aria-label ausgezeichnet', () => {
    render(<InterpretedPreview html='<div>Hi</div>' title="Avatar" />);
    expect(screen.getByRole('button', { name: 'Vorschau in Vollbild öffnen' })).toBeInTheDocument();
  });

  it('das Thumbnail-iframe hat pointer-events: none', () => {
    render(<InterpretedPreview html='<div>Hi</div>' title="Avatar" />);
    const frame = screen.getByTitle('Vorschau: Avatar');
    expect(frame.style.pointerEvents).toBe('none');
  });

  it('zeigt zusätzlich einen "Vollbild"-Textbutton', () => {
    render(<InterpretedPreview html='<div>Hi</div>' title="Avatar" />);
    expect(screen.getByText('Vollbild')).toBeInTheDocument();
  });
});

describe('InterpretedPreview — Vollbild-Modal', () => {
  it('Klick auf das Thumbnail öffnet ein Modal mit zweitem iframe', () => {
    render(<InterpretedPreview html='<div class="p-2">Hi</div>' title="Avatar" />);
    fireEvent.click(screen.getByRole('button', { name: 'Vorschau in Vollbild öffnen' }));
    const frames = screen.getAllByTitle('Vorschau: Avatar');
    expect(frames).toHaveLength(2);
    const modalFrame = frames[1];
    expect(modalFrame.getAttribute('sandbox')).toBe('allow-scripts');
    expect(modalFrame.getAttribute('srcdoc')).toContain('Hi');
    expect(modalFrame.style.pointerEvents).not.toBe('none');
  });

  it('Klick auf den "Vollbild"-Textbutton öffnet ebenfalls das Modal', () => {
    render(<InterpretedPreview html='<div>Hi</div>' title="Avatar" />);
    fireEvent.click(screen.getByText('Vollbild'));
    expect(screen.getAllByTitle('Vorschau: Avatar')).toHaveLength(2);
  });

  it('zeigt die Titelzeile mit dem title-Prop im Modal', () => {
    render(<InterpretedPreview html='<div>Hi</div>' title="Avatar" />);
    fireEvent.click(screen.getByRole('button', { name: 'Vorschau in Vollbild öffnen' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Avatar');
  });

  it('ESC schließt das Modal', () => {
    render(<InterpretedPreview html='<div>Hi</div>' title="Avatar" />);
    fireEvent.click(screen.getByRole('button', { name: 'Vorschau in Vollbild öffnen' }));
    expect(screen.getAllByTitle('Vorschau: Avatar')).toHaveLength(2);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getAllByTitle('Vorschau: Avatar')).toHaveLength(1);
  });

  it('Klick auf den Schließen-Button (×) schließt das Modal', () => {
    render(<InterpretedPreview html='<div>Hi</div>' title="Avatar" />);
    fireEvent.click(screen.getByRole('button', { name: 'Vorschau in Vollbild öffnen' }));
    fireEvent.click(screen.getByRole('button', { name: /schließen/i }));
    expect(screen.getAllByTitle('Vorschau: Avatar')).toHaveLength(1);
  });

  it('Klick auf den Backdrop schließt das Modal', () => {
    render(<InterpretedPreview html='<div>Hi</div>' title="Avatar" />);
    fireEvent.click(screen.getByRole('button', { name: 'Vorschau in Vollbild öffnen' }));
    fireEvent.click(screen.getByTestId('preview-modal-backdrop'));
    expect(screen.getAllByTitle('Vorschau: Avatar')).toHaveLength(1);
  });

  it('Klick in die Karte schließt das Modal NICHT', () => {
    render(<InterpretedPreview html='<div>Hi</div>' title="Avatar" />);
    fireEvent.click(screen.getByRole('button', { name: 'Vorschau in Vollbild öffnen' }));
    fireEvent.click(screen.getByRole('dialog'));
    expect(screen.getAllByTitle('Vorschau: Avatar')).toHaveLength(2);
  });
});

describe('SourcePill "interpreted"', () => {
  it('kennt die gelbe Pille „von KI interpretiert"', () => {
    const m = sourceLabel('interpreted');
    expect(m.label).toBe('von KI interpretiert');
    expect(m.cls).toContain('amber');
  });
});
