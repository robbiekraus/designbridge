import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const indexHtmlPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../index.html');
const html = readFileSync(indexHtmlPath, 'utf-8');

describe('index.html branding', () => {
  it('sets the document title to UIPrism, not Designbridge', () => {
    expect(html).toMatch(/<title>UIPrism<\/title>/);
    expect(html).not.toMatch(/Designbridge/i);
  });

  it('links a UIPrism favicon', () => {
    expect(html).toMatch(/uiprism-favicon/i);
  });
});
