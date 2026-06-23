import { describe, it, expect, beforeEach } from 'vitest';
import { saveLastImport, loadLastImport, clearLastImport } from './libraryStore.js';

describe('libraryStore', () => {
  beforeEach(() => localStorage.clear());

  it('returns null when nothing is stored', () => {
    expect(loadLastImport()).toBeNull();
  });

  it('round-trips a saved result', () => {
    const result = { source: 'image', mocked: false, categories: [], raw: { tokens: {} } };
    saveLastImport(result);
    expect(loadLastImport()).toEqual(result);
  });

  it('returns null for corrupt JSON', () => {
    localStorage.setItem('designbridge.lastImport', '{not valid json');
    expect(loadLastImport()).toBeNull();
  });

  it('clears the stored result', () => {
    saveLastImport({ source: 'url', mocked: true, categories: [], raw: null });
    clearLastImport();
    expect(loadLastImport()).toBeNull();
  });
});
