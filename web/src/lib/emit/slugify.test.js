import { describe, it, expect } from 'vitest';
import { slugify } from './slugify.js';

describe('slugify', () => {
  it('lowercases and dashes spaces', () => {
    expect(slugify('Primary Button Background')).toBe('primary-button-background');
  });
  it('collapses non-alphanumeric runs and trims dashes', () => {
    expect(slugify('  Card / Modal!! ')).toBe('card-modal');
  });
  it('strips German diacritics', () => {
    expect(slugify('Primärer Überschrift')).toBe('primarer-uberschrift');
  });
  it('returns empty string for empty or symbol-only input', () => {
    expect(slugify('')).toBe('');
    expect(slugify('   ')).toBe('');
    expect(slugify('!!!')).toBe('');
    expect(slugify(null)).toBe('');
    expect(slugify(undefined)).toBe('');
  });
});
