import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recognizeWithAi, trimHtml } from './recognizeWithAi.js';
import { CLASSIFICATION_DEFINITIONS, DECOMPOSE_INSTRUCTION } from './prompts/atomicContract.js';
import { SHADCN_VOCABULARY } from './catalog/shadcnVocabulary.js';
import { EXTRACTION_PROMPT } from './claude.js';

function fakeClient(payload) {
  return { messages: { create: async () => ({ content: [{ text: JSON.stringify(payload) }] }) } };
}

const EMPTY_RULES = { atoms: [], molecules: [], organisms: [], templates: [] };

test('returns merged lists from the model', async () => {
  const client = fakeClient({
    atoms: [{ name: 'Button', variants: ['primary'], confidence: 'high', source: 'rules+ai', notes: '' }],
    molecules: [{ name: 'Suche', confidence: 'high', source: 'rules+ai', notes: '' }],
    organisms: [{ name: 'Card', confidence: 'med', source: 'ai', notes: '' }],
    templates: [{ name: 'Page Layout', confidence: 'high', source: 'rules+ai', notes: 'Input → Suche' }],
    warnings: [],
  });
  const out = await recognizeWithAi('<button>x</button>', '', EMPTY_RULES, { client });
  assert.equal(out.atoms[0].source, 'rules+ai');
  assert.equal(out.organisms[0].source, 'ai');
  assert.equal(out.templates[0].notes, 'Input → Suche');
});

test('throws a clear error on invalid JSON', async () => {
  const client = { messages: { create: async () => ({ content: [{ text: 'not json' }] }) } };
  await assert.rejects(
    () => recognizeWithAi('<x>', '', EMPTY_RULES, { client }),
    /kein gültiges JSON/
  );
});

test('abgeschnittene Antwort (max_tokens) → klare deutsche Meldung', async () => {
  const client = { messages: { create: async () => ({ content: [{ text: '{"atoms": [{' }], stop_reason: 'max_tokens' }) } };
  await assert.rejects(
    () => recognizeWithAi('<x>', '', EMPTY_RULES, { client }),
    /abgeschnitten.*erneut/s
  );
});

test('trimHtml strips scripts and caps length, flagging truncation', () => {
  const big = '<script>evil()</script>' + '<div>'.repeat(10000);
  const { html, truncated } = trimHtml(big);
  assert.ok(!html.includes('evil'));
  assert.ok(truncated);
});

test('adds a truncation warning when html was capped', async () => {
  const client = fakeClient({ atoms: [], molecules: [], organisms: [], templates: [], warnings: [] });
  const big = '<div>'.repeat(10000);
  const out = await recognizeWithAi(big, '', EMPTY_RULES, { client });
  assert.ok(out.warnings.some((w) => /gekürzt/.test(w)));
});

test('trimHtml strips an unclosed <script> opening tag', () => {
  const { html } = trimHtml('<script src="https://evil.example/x.js"><div>ok</div>');
  assert.ok(!/<script/i.test(html));
  assert.match(html, /ok/);
});

test('adds a warning when css is large and truncated', async () => {
  const client = fakeClient({ atoms: [], molecules: [], organisms: [], templates: [], warnings: [] });
  const bigCss = '.a{color:red}'.repeat(5000); // well over the css cap
  const out = await recognizeWithAi('<button>x</button>', bigCss, EMPTY_RULES, { client });
  assert.ok(out.warnings.some((w) => /CSS/.test(w) && /gekürzt/.test(w)));
});

test('trims the rule list to valid JSON when it is very large', async () => {
  const client = fakeClient({ atoms: [], molecules: [], organisms: [], templates: [], warnings: [] });
  // build a rule list far larger than MAX_RULES so it must be trimmed
  const many = Array.from({ length: 500 }, (_, i) => ({ name: 'Comp' + i, variants: [], confidence: 'low', source: 'rules', notes: '' }));
  const ruleList = { atoms: many, molecules: many, organisms: many, templates: many };
  // capture the prompt text sent to the model
  let sentText = '';
  const spyClient = { messages: { create: async (args) => { sentText = args.messages[0].content[0].text; return { content: [{ text: JSON.stringify({ atoms: [], molecules: [], organisms: [], templates: [], warnings: [] }) }] }; } } };
  const out = await recognizeWithAi('<button>x</button>', '', ruleList, { client: spyClient });
  // the DRAFT LIST block embedded in the prompt must be valid JSON (extract between the markers)
  const m = sentText.match(/DRAFT LIST \(from rules\):\n([\s\S]*?)\n\nCSS:/);
  assert.ok(m, 'draft list block found in prompt');
  assert.doesNotThrow(() => JSON.parse(m[1]), 'embedded rule list is valid JSON');
  assert.ok(out.warnings.some((w) => /Regel-?Liste|Liste/.test(w) && /gekürzt/.test(w)));
});

test('Prompt enthält den wörtlichen Atomic-Design-Definitionsblock (identisch zu claude.js)', async () => {
  let sentText = '';
  const client = { messages: { create: async (args) => { sentText = args.messages[0].content[0].text; return { content: [{ text: JSON.stringify({ atoms: [], molecules: [], organisms: [], templates: [], warnings: [] }) }] }; } } };
  await recognizeWithAi('<button>x</button>', '', EMPTY_RULES, { client });
  assert.match(sentText, /a card, a chart and a table are ORGANISMS, not molecules/);
  assert.match(sentText, /Emit AT MOST ONE template for the whole screen/);
});

// ─── Zerlegungs-Vertrag im URL-Pfad (27.07.2026) ──────────────────────────────
// Offener TODO aus RESUME.md: „URL-Pfad hat keine DECOMPOSE-Anweisung". Der Bild-Pfad zerlegte
// seine Organismen seit dem 26.07. in Kleinteile, der URL-Pfad nie — der Definitionsblock lag
// dort als wörtliche zweite Kopie, die Zerlegungs-Anweisung fehlte ganz.
test('URL-Prompt trägt die DECOMPOSE-Anweisung mit dem KATALOG-Vokabular', async () => {
  let sentText = '';
  const client = { messages: { create: async (args) => { sentText = args.messages[0].content[0].text; return { content: [{ text: '{}' }] }; } } };
  await recognizeWithAi('<button>x</button>', '', EMPTY_RULES, { client });

  assert.match(sentText, /DECOMPOSE each organism into its reusable inner building blocks/);
  // Nicht irgendeine Kurzliste: dieselbe Quelle wie das Grounding-Vokabular. Ein Neuzugang
  // von 26.07. beweist, dass der Katalog und nicht eine handgeschriebene Liste durchschlägt.
  for (const name of SHADCN_VOCABULARY.map((c) => c.name)) {
    assert.ok(sentText.includes(name), `Vokabular „${name}" fehlt im URL-Prompt`);
  }
  assert.match(sentText, /"partOf"/, 'die Antwort-Form kennt partOf');
  assert.match(sentText, /"instanceCount"/, 'die Antwort-Form kennt instanceCount');
});

test('URL-Prompt und Bild-Prompt teilen sich EINE Quelle für den Vertrag', async () => {
  // Regression gegen die Doppelpflege: beide Blöcke müssen wörtlich identisch sein, nicht
  // „ungefähr gleich". Ein Regex-Vergleich wie bisher hätte ein Auseinanderdriften im
  // Detail nicht bemerkt.
  let sentText = '';
  const client = { messages: { create: async (args) => { sentText = args.messages[0].content[0].text; return { content: [{ text: '{}' }] }; } } };
  await recognizeWithAi('<button>x</button>', '', EMPTY_RULES, { client });

  assert.ok(sentText.includes(CLASSIFICATION_DEFINITIONS), 'Definitionsblock wörtlich enthalten');
  assert.ok(sentText.includes(DECOMPOSE_INSTRUCTION), 'Zerlegungs-Anweisung wörtlich enthalten');
  assert.ok(EXTRACTION_PROMPT.includes(CLASSIFICATION_DEFINITIONS), 'Bild-Prompt nutzt dieselbe Quelle');
  assert.ok(EXTRACTION_PROMPT.includes(DECOMPOSE_INSTRUCTION), 'Bild-Prompt nutzt dieselbe Quelle');
});

test('gleichnamige Bausteine werden verschmolzen, instanceCount summiert', async () => {
  // Die DECOMPOSE-Anweisung lässt die KI wiederkehrende Kleinteile herausziehen — und die
  // kommen erfahrungsgemäß mehrfach (Live-Fund im Bild-Pfad 15.07.: dreimal „button").
  const client = fakeClient({
    atoms: [
      { name: 'Nav Item', variants: ['active'], instanceCount: 3, partOf: 'Sidebar' },
      { name: 'nav item', variants: ['default'], instanceCount: 2 },
      { name: 'Button', instanceCount: 1 },
    ],
    molecules: [], organisms: [], templates: [], warnings: [],
  });
  const out = await recognizeWithAi('<nav/>', '', EMPTY_RULES, { client });

  assert.equal(out.atoms.length, 2);
  const navItem = out.atoms.find((a) => /nav item/i.test(a.name));
  assert.equal(navItem.instanceCount, 5);
  assert.deepEqual([...navItem.variants].sort(), ['active', 'default']);
  assert.equal(navItem.partOf, 'Sidebar', 'partOf überlebt das Verschmelzen');
});

test('partOf und instanceCount werden unverändert durchgereicht', async () => {
  const client = fakeClient({
    atoms: [{ name: 'Badge', instanceCount: 4, partOf: 'Stat Card' }],
    molecules: [], organisms: [{ name: 'Stat Card' }], templates: [], warnings: [],
  });
  const out = await recognizeWithAi('<div/>', '', EMPTY_RULES, { client });
  assert.equal(out.atoms[0].partOf, 'Stat Card');
  assert.equal(out.atoms[0].instanceCount, 4);
});
