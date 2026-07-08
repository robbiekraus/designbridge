// web/src/lib/interpret.test.js
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  componentsNeedingInterpretation,
  requestInterpretations,
  attachInterpretations,
  runInterpretation,
} from './interpret.js';

const RESULT = {
  source: 'image',
  raw: {
    meta: { import_id: 'abc123' },
    tokens: {},
    atomics: [
      { name: 'Button', variants: ['primary'], confidence: 'high' }, // Template → raus
      { name: 'Avatar', variants: [], confidence: 'med', notes: 'rund' }, // kein Template → rein
    ],
    components: [
      { name: 'Stat Card', confidence: 'high' }, // "Card" matcht Template → raus
      { name: 'Data Table', confidence: 'med' }, // rein
    ],
    patterns: [{ name: 'Metrics Overview', confidence: 'low' }], // rein
  },
};

afterEach(() => vi.restoreAllMocks());

describe('componentsNeedingInterpretation', () => {
  it('filtert Template-Treffer raus und behält kind/variants/notes', () => {
    const todo = componentsNeedingInterpretation(RESULT);
    expect(todo.map((t) => t.name)).toEqual(['Avatar', 'Data Table', 'Metrics Overview']);
    expect(todo[0]).toEqual({ name: 'Avatar', kind: 'atomic', variants: [], notes: 'rund' });
  });

  it('lässt bereits interpretierte Bausteine aus', () => {
    const withOne = { ...RESULT, interpretations: { Avatar: { html: '<div/>', jsx: '' } } };
    expect(componentsNeedingInterpretation(withOne).map((t) => t.name)).toEqual([
      'Data Table', 'Metrics Overview',
    ]);
  });

  it('liefert [] ohne raw', () => {
    expect(componentsNeedingInterpretation({ source: 'url', raw: null })).toEqual([]);
  });
});

describe('requestInterpretations', () => {
  it('POSTet import_id + components und liefert die Antwort', async () => {
    const payload = { interpretations: [{ name: 'Avatar', html: '<div/>', jsx: '' }], failed: [] };
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => payload }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await requestInterpretations('abc123', [{ name: 'Avatar' }]);
    expect(res).toEqual(payload);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/interpret/components');
    expect(JSON.parse(opts.body)).toEqual({ import_id: 'abc123', components: [{ name: 'Avatar' }] });
  });

  it('wirft die Server-Fehlermeldung bei !ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: 'Bild nicht mehr verfügbar — bitte erneut importieren.' }),
    })));
    await expect(requestInterpretations('old', [{ name: 'X' }])).rejects.toThrow(/nicht mehr verfügbar/);
  });
});

describe('attachInterpretations', () => {
  it('merged in die Map, setzt failed und beendet pending', () => {
    const next = attachInterpretations(
      { ...RESULT, interpretations: { Old: { html: '<b/>', jsx: '' } }, interpretPending: true },
      { interpretations: [{ name: 'Avatar', html: '<div/>', jsx: 'x' }], failed: ['Data Table'] }
    );
    expect(next.interpretations.Old).toBeTruthy();
    expect(next.interpretations.Avatar).toEqual({ html: '<div/>', jsx: 'x' });
    expect(next.interpretFailed).toEqual(['Data Table']);
    expect(next.interpretPending).toBe(false);
    expect(next.interpretError).toBeNull();
  });
});

describe('runInterpretation', () => {
  it('liefert null wenn nichts zu tun ist (keine offenen Bausteine)', async () => {
    const done = {
      ...RESULT,
      interpretations: {
        Avatar: { html: '<div/>', jsx: '' },
        'Data Table': { html: '<div/>', jsx: '' },
        'Metrics Overview': { html: '<div/>', jsx: '' },
      },
    };
    expect(await runInterpretation(done)).toBeNull();
  });

  it('liefert null ohne import_id oder für nicht-image-Quellen', async () => {
    expect(await runInterpretation({ ...RESULT, raw: { ...RESULT.raw, meta: {} } })).toBeNull();
    expect(await runInterpretation({ ...RESULT, source: 'url' })).toBeNull();
  });

  it('happy path: holt und merged', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ interpretations: [{ name: 'Avatar', html: '<div/>', jsx: '' }], failed: [] }),
    })));
    const next = await runInterpretation(RESULT);
    expect(next.interpretations.Avatar).toBeTruthy();
    expect(next.interpretPending).toBe(false);
  });

  it('Fehlerpfad: markiert alle offenen als failed + setzt interpretError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({ error: 'kaputt' }) })));
    const next = await runInterpretation(RESULT);
    expect(next.interpretError).toBe('kaputt');
    expect(next.interpretFailed).toEqual(['Avatar', 'Data Table', 'Metrics Overview']);
    expect(next.interpretPending).toBe(false);
  });
});
