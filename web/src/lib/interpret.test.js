// web/src/lib/interpret.test.js
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  componentsNeedingInterpretation,
  requestInterpretations,
  attachInterpretations,
  runInterpretation,
  retryInterpretation,
  applyIfSameImport,
  normalizeStalePending,
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

  it('repo: Bausteine ohne gehobenen Code (Patterns, pfad-only) fliegen aus dem Batch', () => {
    const result = {
      source: 'repo',
      raw: {
        meta: { import_id: 'r1' },
        components: [
          { name: 'Callout', path: 'components/callout.tsx', sourceCode: 'export const Callout=()=>null;' },
        ],
        patterns: [{ name: 'Dashboard Layout', confidence: 'low' }], // kein path/sourceCode → kein Material
      },
    };
    expect(componentsNeedingInterpretation(result).map((t) => t.name)).toEqual(['Callout']);
  });

  it('repo: gehobener Baustein mit Template-Namens-Kollision bleibt im Batch (FF2-Konsistenz)', () => {
    const result = {
      source: 'repo',
      raw: {
        meta: { import_id: 'r1' },
        components: [
          // "CardSkeleton" matcht das card-Template — gehoben zählt der echte Code, nicht das Template.
          { name: 'CardSkeleton', path: 'ui/card-skeleton.tsx', sourceCode: 'export const CardSkeleton=()=>null;' },
        ],
      },
    };
    expect(componentsNeedingInterpretation(result).map((t) => t.name)).toEqual(['CardSkeleton']);
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

  it('Quota-Bremse: trägt dailyQuota:true wenn der Server daily_quota:true meldet', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      json: async () => ({
        error: 'Gemini-Tages-Kontingent erschöpft — Reset um Mitternacht kalifornischer Zeit (ca. 09:00 deutscher Zeit). Bitte später erneut versuchen.',
        daily_quota: true,
      }),
    })));
    let caught;
    try { await requestInterpretations('abc123', [{ name: 'X' }]); } catch (e) { caught = e; }
    expect(caught).toBeTruthy();
    expect(caught.dailyQuota).toBe(true);
    expect(caught.message).toMatch(/Tages-Kontingent erschöpft/);
  });

  it('dailyQuota bleibt false bei einem gewöhnlichen Fehler (kein daily_quota-Flag)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({ error: 'kaputt' }) })));
    let caught;
    try { await requestInterpretations('abc123', [{ name: 'X' }]); } catch (e) { caught = e; }
    expect(caught.dailyQuota).toBe(false);
  });
});

describe('attachInterpretations', () => {
  it('merged in die Map, setzt failed und beendet pending', () => {
    const next = attachInterpretations(
      { ...RESULT, interpretations: { Old: { html: '<b/>', jsx: '' } }, interpretPending: true },
      { interpretations: [{ name: 'Avatar', html: '<div/>', jsx: 'x' }], failed: ['Data Table'] }
    );
    expect(next.interpretations.Old).toBeTruthy();
    expect(next.interpretations.Avatar).toEqual({ html: '<div/>', jsx: 'x', model: null, demo: false });
    expect(next.interpretFailed).toEqual(['Data Table']);
    expect(next.interpretPending).toBe(false);
    expect(next.interpretError).toBeNull();
  });

  it('übernimmt model und demo-Flag', () => {
    const result = { interpretations: {} };
    const data = { interpretations: [{ name: 'button', html: '<b/>', jsx: '', model: 'gemini-x' }], failed: [], demo: true };
    const next = attachInterpretations(result, data);
    expect(next.interpretations.button.model).toBe('gemini-x');
    expect(next.interpretations.button.demo).toBe(true);
  });

  it('setzt model auf null und demo auf false, wenn nicht mitgeliefert', () => {
    const result = { interpretations: {} };
    const data = { interpretations: [{ name: 'avatar', html: '<div/>', jsx: '' }], failed: [] };
    const next = attachInterpretations(result, data);
    expect(next.interpretations.avatar.model).toBeNull();
    expect(next.interpretations.avatar.demo).toBe(false);
  });

  it('Quota-Bremse: räumt eine vorherige interpretQuotaExhausted-Sperre bei jedem Erfolg', () => {
    const result = { interpretations: {}, interpretQuotaExhausted: true };
    const data = { interpretations: [{ name: 'avatar', html: '<div/>', jsx: '' }], failed: [] };
    const next = attachInterpretations(result, data);
    expect(next.interpretQuotaExhausted).toBe(false);
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

describe('runInterpretation — progressive Chunks + Abort', () => {
  const NINE = {
    source: 'image',
    raw: {
      meta: { import_id: 'nine1' },
      atomics: Array.from({ length: 9 }, (_, i) => ({ name: `Widget${i + 1}`, variants: [], notes: '' })),
      components: [],
      patterns: [],
    },
  };

  it('9 todo-Komponenten → 3 Chunk-Requests (≤4 je Body), onProgress je Chunk mit interpretPending:true, Endergebnis vollständig', async () => {
    const calls = [];
    const progressStates = [];
    vi.stubGlobal('fetch', vi.fn(async (url, opts) => {
      const body = JSON.parse(opts.body);
      calls.push(body.components.map((c) => c.name));
      return {
        ok: true,
        json: async () => ({
          interpretations: body.components.map((c) => ({ name: c.name, html: `<div>${c.name}</div>`, jsx: '' })),
          failed: [],
        }),
      };
    }));
    const onProgress = vi.fn((state) => progressStates.push(state));
    const next = await runInterpretation(NINE, { onProgress });

    expect(calls.length).toBe(3);
    calls.forEach((c) => expect(c.length).toBeLessThanOrEqual(4));
    expect(calls.flat()).toEqual([
      'Widget1', 'Widget2', 'Widget3', 'Widget4',
      'Widget5', 'Widget6', 'Widget7', 'Widget8',
      'Widget9',
    ]);
    expect(onProgress).toHaveBeenCalledTimes(3);
    progressStates.forEach((state) => expect(state.interpretPending).toBe(true));
    expect(next.interpretPending).toBe(false);
    expect(Object.keys(next.interpretations)).toHaveLength(9);
    expect(next.interpretFailed).toEqual([]);
    expect(next.interpretError).toBeNull();
  });

  it('Chunk 2 von 3 schlägt fehl → Chunk 1+3 kommen durch, Chunk-2-Namen in interpretFailed, kein interpretError (anySuccess)', async () => {
    let call = 0;
    vi.stubGlobal('fetch', vi.fn(async (url, opts) => {
      call++;
      if (call === 2) throw new Error('netz kaputt');
      const body = JSON.parse(opts.body);
      return {
        ok: true,
        json: async () => ({
          interpretations: body.components.map((c) => ({ name: c.name, html: '<div/>', jsx: '' })),
          failed: [],
        }),
      };
    }));
    const next = await runInterpretation(NINE);
    expect(next.interpretError).toBeNull();
    expect(next.interpretFailed).toEqual(['Widget5', 'Widget6', 'Widget7', 'Widget8']);
    expect(Object.keys(next.interpretations).sort()).toEqual(
      ['Widget1', 'Widget2', 'Widget3', 'Widget4', 'Widget9'].sort()
    );
    expect(next.interpretPending).toBe(false);
  });

  it('alle Chunks schlagen fehl → interpretError gesetzt, alle Namen failed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('alles kaputt'); }));
    const next = await runInterpretation(NINE);
    expect(next.interpretError).toBe('alles kaputt');
    expect(next.interpretFailed).toEqual([
      'Widget1', 'Widget2', 'Widget3', 'Widget4',
      'Widget5', 'Widget6', 'Widget7', 'Widget8', 'Widget9',
    ]);
    expect(next.interpretPending).toBe(false);
    expect(Object.keys(next.interpretations ?? {})).toHaveLength(0);
  });

  it('Quota-Bremse: Chunk 2 meldet daily_quota → Schleife stoppt sofort, Chunk 3 wird NIE gesendet, alle Namen ab Chunk 2 failed', async () => {
    let call = 0;
    vi.stubGlobal('fetch', vi.fn(async (url, opts) => {
      call++;
      if (call === 2) {
        return {
          ok: false,
          json: async () => ({
            error: 'Gemini-Tages-Kontingent erschöpft — Reset um Mitternacht kalifornischer Zeit (ca. 09:00 deutscher Zeit). Bitte später erneut versuchen.',
            daily_quota: true,
          }),
        };
      }
      const body = JSON.parse(opts.body);
      return {
        ok: true,
        json: async () => ({
          interpretations: body.components.map((c) => ({ name: c.name, html: '<div/>', jsx: '' })),
          failed: [],
        }),
      };
    }));
    const next = await runInterpretation(NINE);

    expect(call).toBe(2); // Chunk 3 (3. Request) wurde nie gesendet — Fail-Fast
    expect(next.interpretQuotaExhausted).toBe(true);
    expect(next.interpretError).toMatch(/Tages-Kontingent erschöpft/);
    // Chunk 1 (Widget1-4) kam durch, Chunk 2 (Widget5-8) UND Chunk 3 (Widget9,
    // nie gesendet) landen als failed.
    expect(next.interpretFailed.sort()).toEqual(
      ['Widget5', 'Widget6', 'Widget7', 'Widget8', 'Widget9'].sort()
    );
    expect(Object.keys(next.interpretations).sort()).toEqual(
      ['Widget1', 'Widget2', 'Widget3', 'Widget4'].sort()
    );
    expect(next.interpretPending).toBe(false);
  });

  it('signal bereits aborted vor Chunk 2 → gibt null zurück, kein weiterer fetch', async () => {
    let call = 0;
    const controller = new AbortController();
    const fetchMock = vi.fn(async (url, opts) => {
      call++;
      if (call === 1) controller.abort(); // Abort passiert während Chunk 1 noch läuft
      const body = JSON.parse(opts.body);
      return {
        ok: true,
        json: async () => ({
          interpretations: body.components.map((c) => ({ name: c.name, html: '<div/>', jsx: '' })),
          failed: [],
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);
    const next = await runInterpretation(NINE, { signal: controller.signal });
    expect(next).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1); // Chunk 2/3 wurden wegen Abort nie gesendet
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
    expect(next.interpretations.Avatar).toEqual({ html: '<div/>', jsx: '', model: null, demo: false });
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

  it('Quota-Bremse: daily_quota-Fehler setzt zusätzlich interpretQuotaExhausted:true', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      json: async () => ({
        error: 'Gemini-Tages-Kontingent erschöpft — Reset um Mitternacht kalifornischer Zeit (ca. 09:00 deutscher Zeit). Bitte später erneut versuchen.',
        daily_quota: true,
      }),
    })));
    const next = await retryInterpretation(FAILED_RESULT, 'Avatar');
    expect(next.interpretQuotaExhausted).toBe(true);
    expect(next.interpretError).toMatch(/Tages-Kontingent erschöpft/);
    expect(next.interpretFailed).toEqual(['Avatar', 'Stat Card']);
  });

  it('Quota-Bremse: Erfolg nach einer Quota-Sperre räumt interpretQuotaExhausted wieder', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ interpretations: [{ name: 'Avatar', html: '<div/>', jsx: '' }], failed: [] }),
    })));
    const blocked = { ...FAILED_RESULT, interpretQuotaExhausted: true };
    const next = await retryInterpretation(blocked, 'Avatar');
    expect(next.interpretQuotaExhausted).toBe(false);
  });
});

describe('componentsNeedingInterpretation — repo path', () => {
  // Name bewusst nicht "…Card/Tile/Panel" o.ä. — würde vom generischen
  // Card-Template gematcht (matchTemplate) und flöge raus, noch bevor
  // path je geprüft wird. Siehe web/src/lib/components/templates/card.js.
  it('componentsNeedingInterpretation reicht path durch', () => {
    // Reale /repo-Shape: Items mit Datei-Inhalt tragen immer sourceCode
    // (liftRepoInventory läuft vor res.json) — ohne sourceCode = kein Material.
    const result = { source: 'repo', raw: { atomics: [], patterns: [],
      components: [{ name: 'PricingWidget', path: 'src/components/PricingWidget.tsx', sourceCode: 'export const PricingWidget=()=>null;' }] } };
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
      components: [{ name: 'PricingWidget', path: 'p.tsx', sourceCode: 'export const PricingWidget=()=>null;' }] } };
    const next = await runInterpretation(result);
    expect(next).not.toBe(null);
    expect(calls[0].components[0].path).toBe('p.tsx');
    expect(next.interpretations.PricingWidget.html).toBe('<div/>');
  });
});

describe('normalizeStalePending — Reload-Limbo-Fix', () => {
  // Reload während einer laufenden Interpretation: der zugehörige Request ist
  // weg (Seite neu geladen), aber der persistierte Zustand sagt noch
  // interpretPending:true — ohne Fix bleiben die Bausteine für immer auf
  // "Wird interpretiert …" hängen, ohne Retry-Knopf.
  it('interpretPending:true → wird zu failed normalisiert (alle offenen Bausteine), Retry-Knopf erscheint', () => {
    const stale = { ...RESULT, interpretPending: true };
    const next = normalizeStalePending(stale);
    expect(next.interpretPending).toBe(false);
    expect(next.interpretFailed).toEqual(['Avatar', 'Stat Card', 'Data Table', 'Metrics Overview']);
    expect(next.interpretError).toBeTruthy();
  });

  it('interpretPending:false → unverändert (gleiche Referenz, keine Re-Renders)', () => {
    const clean = { ...RESULT, interpretPending: false };
    expect(normalizeStalePending(clean)).toBe(clean);
  });

  it('kein interpretPending-Feld → unverändert', () => {
    expect(normalizeStalePending(RESULT)).toBe(RESULT);
  });

  it('null/undefined → wirft nie', () => {
    expect(normalizeStalePending(null)).toBeNull();
    expect(normalizeStalePending(undefined)).toBeUndefined();
  });

  it('bereits interpretierte Bausteine tauchen nicht in interpretFailed auf', () => {
    const stale = {
      ...RESULT,
      interpretPending: true,
      interpretations: { Avatar: { html: '<div/>', jsx: '' } },
    };
    const next = normalizeStalePending(stale);
    expect(next.interpretFailed).toEqual(['Stat Card', 'Data Table', 'Metrics Overview']);
  });

  it('bestehende interpretFailed-Einträge bleiben erhalten (Union, keine Duplikate)', () => {
    const stale = { ...RESULT, interpretPending: true, interpretFailed: ['Avatar'] };
    const next = normalizeStalePending(stale);
    expect(next.interpretFailed).toEqual(['Avatar', 'Stat Card', 'Data Table', 'Metrics Overview']);
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
