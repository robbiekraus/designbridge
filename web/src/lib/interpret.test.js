// web/src/lib/interpret.test.js
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  componentsNeedingInterpretation,
  requestInterpretations,
  attachInterpretations,
  runInterpretation,
  retryInterpretation,
  applyIfSameImport,
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
      { name: 'Stat Card', confidence: 'high' }, // inhaltstragende Card → rein (Leck 1 Fix)
      { name: 'Data Table', confidence: 'med' }, // rein
    ],
    patterns: [{ name: 'Metrics Overview', confidence: 'low' }], // rein
  },
};

afterEach(() => vi.restoreAllMocks());

describe('componentsNeedingInterpretation', () => {
  it('filtert Template-Treffer raus und behält kind/variants/notes', () => {
    const todo = componentsNeedingInterpretation(RESULT);
    expect(todo.map((t) => t.name)).toEqual(['Avatar', 'Stat Card', 'Data Table', 'Metrics Overview']);
    expect(todo[0]).toEqual({ name: 'Avatar', kind: 'atomic', variants: [], notes: 'rund', bbox: null, selector: null, path: null });
  });

  it('passes bbox through and routes content-bearing cards to interpretation', () => {
    const result = { raw: { components: [
      { name: 'Card', confidence: 'high', notes: '', bbox: { x:0,y:0,w:0.1,h:0.1 } },        // Template → raus
      { name: 'Stat Card', confidence: 'high', notes: 'Sales', bbox: { x:0.1,y:0,w:0.2,h:0.2 } }, // interpretieren
    ] } };
    const todo = componentsNeedingInterpretation(result);
    const names = todo.map((t) => t.name);
    expect(names).toContain('Stat Card');
    expect(names).not.toContain('Card');
    expect(todo.find((t) => t.name === 'Stat Card').bbox).toEqual({ x:0.1,y:0,w:0.2,h:0.2 });
  });

  it('lässt bereits interpretierte Bausteine aus', () => {
    const withOne = { ...RESULT, interpretations: { Avatar: { html: '<div/>', jsx: '' } } };
    expect(componentsNeedingInterpretation(withOne).map((t) => t.name)).toEqual([
      'Stat Card', 'Data Table', 'Metrics Overview',
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
        'Stat Card': { html: '<div/>', jsx: '' },
        'Data Table': { html: '<div/>', jsx: '' },
        'Metrics Overview': { html: '<div/>', jsx: '' },
      },
    };
    expect(await runInterpretation(done)).toBeNull();
  });

  it('liefert null ohne import_id oder für nicht unterstützte Quellen', async () => {
    expect(await runInterpretation({ ...RESULT, raw: { ...RESULT.raw, meta: {} } })).toBeNull();
    // 'repo' ist jetzt unterstützt (Batch-Knopf) — 'figma' (noch) nicht.
    expect(await runInterpretation({ ...RESULT, source: 'figma' })).toBeNull();
  });

  it('läuft auch für source url und reicht selector durch', async () => {
    let sentBody = null;
    vi.stubGlobal('fetch', vi.fn(async (url, opts) => {
      sentBody = JSON.parse(opts.body);
      return {
        ok: true,
        json: async () => ({ interpretations: [{ name: 'Avatar', html: '<div/>', jsx: '' }], failed: [] }),
      };
    }));
    const urlResult = {
      ...RESULT,
      source: 'url',
      raw: {
        ...RESULT.raw,
        atomics: [{ name: 'Avatar', selector: 'html > body > div' }],
      },
    };
    const next = await runInterpretation(urlResult);
    expect(next.interpretations.Avatar).toBeTruthy();
    const avatar = sentBody.components.find((c) => c.name === 'Avatar');
    expect(avatar.selector).toBe('html > body > div');
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
    expect(next.interpretFailed).toEqual(['Avatar', 'Stat Card', 'Data Table', 'Metrics Overview']);
    expect(next.interpretPending).toBe(false);
  });
});

describe('retryInterpretation', () => {
  const FAILED_RESULT = {
    ...RESULT,
    interpretFailed: ['Avatar', 'Stat Card'],
    interpretError: 'kaputt',
  };

  it('POSTet genau den einen Baustein (inkl. bbox/selector)', async () => {
    let sentBody = null;
    vi.stubGlobal('fetch', vi.fn(async (url, opts) => {
      sentBody = JSON.parse(opts.body);
      return {
        ok: true,
        json: async () => ({ interpretations: [{ name: 'Avatar', html: '<div/>', jsx: '' }], failed: [] }),
      };
    }));
    await retryInterpretation(FAILED_RESULT, 'Avatar');
    expect(sentBody.import_id).toBe('abc123');
    expect(sentBody.components).toHaveLength(1);
    expect(sentBody.components[0]).toEqual({
      name: 'Avatar', kind: 'atomic', variants: [], notes: 'rund', bbox: null, selector: null, path: null,
    });
  });

  it('Erfolg: entfernt nur den einen Namen aus interpretFailed, andere bleiben', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ interpretations: [{ name: 'Avatar', html: '<div/>', jsx: '' }], failed: [] }),
    })));
    const next = await retryInterpretation(FAILED_RESULT, 'Avatar');
    expect(next.interpretations.Avatar).toEqual({ html: '<div/>', jsx: '' });
    expect(next.interpretFailed).toEqual(['Stat Card']);
    expect(next.interpretError).toBeNull();
  });

  it('Fehler: behält den Namen (und die anderen) in interpretFailed, setzt interpretError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({ error: 'immer noch kaputt' }) })));
    const next = await retryInterpretation(FAILED_RESULT, 'Avatar');
    expect(next.interpretFailed).toEqual(['Avatar', 'Stat Card']);
    expect(next.interpretError).toBe('immer noch kaputt');
    expect(next.interpretPending).toBe(false);
  });

  it('Server meldet den Namen weiterhin als failed: bleibt drin, andere bleiben unberührt', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ interpretations: [], failed: ['Avatar'] }),
    })));
    const next = await retryInterpretation(FAILED_RESULT, 'Avatar');
    expect(next.interpretFailed).toEqual(['Avatar', 'Stat Card']);
  });

  it('wirft nie und gibt das Result unverändert zurück, wenn der Baustein unbekannt ist', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const next = await retryInterpretation(FAILED_RESULT, 'Unbekannt');
    expect(next).toBe(FAILED_RESULT);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('wirft nie ohne import_id', async () => {
    const noImportId = { ...FAILED_RESULT, raw: { ...FAILED_RESULT.raw, meta: {} } };
    const next = await retryInterpretation(noImportId, 'Avatar');
    expect(next).toBe(noImportId);
  });
});

describe('componentsNeedingInterpretation — repo path', () => {
  // Name bewusst nicht "…Card/Tile/Panel" o.ä. — würde vom generischen
  // Card-Template gematcht (matchTemplate) und flöge raus, noch bevor
  // path je geprüft wird. Siehe web/src/lib/components/templates/card.js.
  it('componentsNeedingInterpretation reicht path durch', () => {
    const result = { source: 'repo', raw: { atomics: [], patterns: [],
      components: [{ name: 'PricingWidget', path: 'src/components/PricingWidget.tsx' }] } };
    const [c] = componentsNeedingInterpretation(result);
    expect(c.path).toBe('src/components/PricingWidget.tsx');
  });
});

describe('runInterpretation — source repo', () => {
  it('runInterpretation läuft für source:repo (Batch-Knopf)', async () => {
    const calls = [];
    global.fetch = async (url, opts) => {
      calls.push(JSON.parse(opts.body));
      return { ok: true, json: async () => ({ interpretations: [{ name: 'PricingWidget', html: '<div/>', jsx: '' }], failed: [] }) };
    };
    const result = { source: 'repo', raw: { meta: { import_id: 'id1' }, atomics: [], patterns: [],
      components: [{ name: 'PricingWidget', path: 'p.tsx' }] } };
    const next = await runInterpretation(result);
    expect(next).not.toBe(null);
    expect(calls[0].components[0].path).toBe('p.tsx');
    expect(next.interpretations.PricingWidget.html).toBe('<div/>');
  });
});

describe('applyIfSameImport', () => {
  const importA = { raw: { meta: { import_id: 'A' } }, tag: 'A' };
  const importB = { raw: { meta: { import_id: 'B' } }, tag: 'B-result' };

  it('wendet next an, wenn die import_id noch übereinstimmt', () => {
    const cur = { raw: { meta: { import_id: 'A' } }, tag: 'A-updated-state' };
    const next = { raw: { meta: { import_id: 'A' } }, tag: 'A-interpreted' };
    expect(applyIfSameImport(cur, next)).toBe(next);
  });

  it('verwirft next, wenn cur inzwischen einen neueren Import trägt (Stale-Closure-Race)', () => {
    expect(applyIfSameImport(importB, importA)).toBe(importB);
  });

  it('gibt cur zurück, wenn next null ist', () => {
    expect(applyIfSameImport(importA, null)).toBe(importA);
  });
});
