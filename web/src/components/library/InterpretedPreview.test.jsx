// web/src/components/library/InterpretedPreview.test.jsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import InterpretedPreview, { buildSrcdoc } from './InterpretedPreview.jsx';
import { sourceLabel } from './SourcePill.jsx';
import { PREVIEW_VIRTUAL_WIDTH } from '../../lib/previewWidth.js';

describe('buildSrcdoc', () => {
  it('bettet das HTML und die Tailwind-Laufzeit ein', () => {
    const doc = buildSrcdoc('<div class="p-2">Hi</div>');
    expect(doc).toContain('cdn.tailwindcss.com');
    expect(doc).toContain('<div class="p-2">Hi</div>');
    expect(doc.startsWith('<!doctype html>')).toBe(true);
  });

  it('ohne instanceId wird kein Height-Report-Script eingebettet', () => {
    const doc = buildSrcdoc('<div>Hi</div>');
    expect(doc).not.toContain('designbridge-preview-height');
  });

  it('mit instanceId wird ein Height-Report-Script mit postMessage eingebettet', () => {
    const doc = buildSrcdoc('<div>Hi</div>', 'abc123');
    expect(doc).toContain('designbridge-preview-height');
    expect(doc).toContain('postMessage');
    expect(doc).toContain('abc123');
    expect(doc).toContain('ResizeObserver');
    expect(doc).toContain('<div>Hi</div>');
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

  // Testrunde 8, Spec §Fix 1: die Thumbnail-Breite und htmlToPlan.js' Offscreen-Mess-Breite
  // muessen dieselbe Konstante (PREVIEW_VIRTUAL_WIDTH, s. web/src/lib/previewWidth.js) sein —
  // sonst friert die Figma-Vermessung inline-%-Breiten anders ein als die Vorschau sie zeigt
  // (bewiesener Bug: 360px-Mess-Container vs. 1024px-Vorschau). Siehe die analoge Assertion in
  // src/lib/emit/htmlToPlan.test.js ("gemeinsame Mess-Breite").
  it('das Thumbnail-iframe rendert mit PREVIEW_VIRTUAL_WIDTH (1024) — derselben Konstante wie htmlToPlan.js', () => {
    render(<InterpretedPreview html='<div>Hi</div>' title="Avatar" />);
    const frame = screen.getByTitle('Vorschau: Avatar');
    expect(PREVIEW_VIRTUAL_WIDTH).toBe(1024);
    expect(frame.style.width).toBe(`${PREVIEW_VIRTUAL_WIDTH}px`);
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

describe('InterpretedPreview — Thumbnail content-adaptive Höhe', () => {
  function getInstanceId() {
    const wrapper = screen.getByTestId('preview-thumb-wrapper');
    const id = wrapper.dataset.instanceId;
    expect(id).toBeTruthy();
    return id;
  }

  it('Fallback-Höhe ohne Message bleibt wie bisher', () => {
    render(<InterpretedPreview html='<div>Hi</div>' title="Avatar" />);
    const wrapper = screen.getByTestId('preview-thumb-wrapper');
    expect(wrapper.style.height).not.toBe('');
    expect(parseFloat(wrapper.style.height)).toBeGreaterThan(0);
  });

  it('postMessage mit passender id und type ändert die Wrapper-Höhe', () => {
    render(<InterpretedPreview html='<div>Hi</div>' title="Avatar" />);
    const wrapper = screen.getByTestId('preview-thumb-wrapper');
    const beforeHeight = parseFloat(wrapper.style.height);
    const id = getInstanceId();

    fireEvent(
      window,
      new MessageEvent('message', {
        data: { type: 'designbridge-preview-height', id, height: 120 },
      })
    );

    const afterHeight = parseFloat(wrapper.style.height);
    expect(afterHeight).not.toBe(beforeHeight);
    expect(afterHeight).toBeLessThan(beforeHeight);
  });

  it('sehr kleine gemeldete Höhe wird auf mind. 40px geklemmt (skaliert)', () => {
    render(<InterpretedPreview html='<div>Hi</div>' title="Avatar" />);
    const wrapper = screen.getByTestId('preview-thumb-wrapper');
    const id = getInstanceId();

    fireEvent(
      window,
      new MessageEvent('message', {
        data: { type: 'designbridge-preview-height', id, height: 0 },
      })
    );

    const afterHeight = parseFloat(wrapper.style.height);
    expect(afterHeight).toBeGreaterThan(0);
  });

  it('sehr große gemeldete Höhe wird auf 800 gedeckelt (skaliert)', () => {
    render(<InterpretedPreview html='<div>Hi</div>' title="Avatar" />);
    const wrapper = screen.getByTestId('preview-thumb-wrapper');
    const id = getInstanceId();

    fireEvent(
      window,
      new MessageEvent('message', {
        data: { type: 'designbridge-preview-height', id, height: 5000 },
      })
    );

    const cappedHeight = parseFloat(wrapper.style.height);

    fireEvent(
      window,
      new MessageEvent('message', {
        data: { type: 'designbridge-preview-height', id, height: 900 },
      })
    );
    const alsoCappedHeight = parseFloat(wrapper.style.height);
    expect(alsoCappedHeight).toBe(cappedHeight);
  });

  it('falscher type wird ignoriert', () => {
    render(<InterpretedPreview html='<div>Hi</div>' title="Avatar" />);
    const wrapper = screen.getByTestId('preview-thumb-wrapper');
    const beforeHeight = wrapper.style.height;
    const id = getInstanceId();

    fireEvent(
      window,
      new MessageEvent('message', {
        data: { type: 'other-type', id, height: 120 },
      })
    );

    expect(wrapper.style.height).toBe(beforeHeight);
  });

  it('falsche id wird ignoriert', () => {
    render(<InterpretedPreview html='<div>Hi</div>' title="Avatar" />);
    const wrapper = screen.getByTestId('preview-thumb-wrapper');
    const beforeHeight = wrapper.style.height;

    fireEvent(
      window,
      new MessageEvent('message', {
        data: { type: 'designbridge-preview-height', id: 'not-the-real-id', height: 120 },
      })
    );

    expect(wrapper.style.height).toBe(beforeHeight);
  });

  it('Vollbild-Modal-iframe bleibt von Height-Messages unbeeinflusst (nur Thumbnail-id zählt)', () => {
    render(<InterpretedPreview html='<div>Hi</div>' title="Avatar" />);
    fireEvent.click(screen.getByRole('button', { name: 'Vorschau in Vollbild öffnen' }));
    const frames = screen.getAllByTitle('Vorschau: Avatar');
    const modalFrame = frames[1];
    // Modal iframe darf kein Height-Report-Script eingebettet haben
    expect(modalFrame.getAttribute('srcdoc')).not.toContain('designbridge-preview-height');
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
