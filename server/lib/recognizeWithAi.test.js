import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recognizeWithAi, trimHtml } from './recognizeWithAi.js';

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
