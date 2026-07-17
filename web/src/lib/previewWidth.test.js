// web/src/lib/previewWidth.test.js
import { describe, it, expect } from 'vitest';
import { PREVIEW_VIRTUAL_WIDTH } from './previewWidth.js';

describe('PREVIEW_VIRTUAL_WIDTH (Testrunde 8, Spec §Fix 1)', () => {
  it('ist 1024 (WYSIWYG-Vertrag: Vorschau und Figma-Vermessung nutzen dieselbe virtuelle Breite)', () => {
    expect(PREVIEW_VIRTUAL_WIDTH).toBe(1024);
  });
});
