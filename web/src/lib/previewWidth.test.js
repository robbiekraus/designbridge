// web/src/lib/previewWidth.test.js
import { describe, it, expect } from 'vitest';
import { PREVIEW_VIRTUAL_WIDTH, PREVIEW_VIRTUAL_HEIGHT } from './previewWidth.js';

describe('PREVIEW_VIRTUAL_WIDTH (Testrunde 8, Spec §Fix 1)', () => {
  it('ist 1024 (WYSIWYG-Vertrag: Vorschau und Figma-Vermessung nutzen dieselbe virtuelle Breite)', () => {
    expect(PREVIEW_VIRTUAL_WIDTH).toBe(1024);
  });
});

describe('PREVIEW_VIRTUAL_HEIGHT (Plan-Fidelity-Scheibe, Spec §Scheibe B)', () => {
  it('ist 768 (Höhen-Kontext für den Offscreen-Mess-Container, damit Prozent-Höhen auflösen)', () => {
    expect(PREVIEW_VIRTUAL_HEIGHT).toBe(768);
  });
});
