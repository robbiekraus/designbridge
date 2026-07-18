import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recognizeComponents } from './recognizeComponents.js';

const names = (arr) => arr.map((x) => x.name);

test('detects a Button from <button> with variants from classes', () => {
  const html = '<button class="btn btn-primary">A</button><button class="btn btn-secondary">B</button>';
  const { atoms } = recognizeComponents(html);
  const btn = atoms.find((a) => a.name === 'Button');
  assert.ok(btn);
  assert.equal(btn.confidence, 'high');
  assert.equal(btn.source, 'rules');
  assert.deepEqual(btn.variants, ['primary', 'secondary']);
});

test('collapses multiple buttons into a single Button entry', () => {
  const html = '<button>A</button><button>B</button><button>C</button>';
  const { atoms } = recognizeComponents(html);
  assert.equal(atoms.filter((a) => a.name === 'Button').length, 1);
});

test('Suche wandert zu molecules, Input bleibt atom', () => {
  const html = '<input type="search"><input type="text"><textarea></textarea>';
  const { atoms, molecules } = recognizeComponents(html);
  assert.ok(names(molecules).includes('Suche'));
  assert.ok(!names(atoms).includes('Suche'), 'Suche darf kein atom sein');
  assert.ok(names(atoms).includes('Input'));
});

test('detects Badge from class with low confidence', () => {
  const html = '<span class="badge">Neu</span>';
  const { atoms } = recognizeComponents(html);
  const badge = atoms.find((a) => a.name === 'Badge');
  assert.ok(badge);
  assert.equal(badge.confidence, 'low');
});

test('Navbar/Hero/Footer/Sidebar werden organisms, nicht template', () => {
  const html = '<nav>n</nav><header><h1>t</h1></header><footer>f</footer><aside>a</aside>';
  const { organisms, templates } = recognizeComponents(html);
  const names_ = organisms.map((p) => p.name);
  assert.deepEqual(names_.sort(), ['Footer', 'Hero', 'Navbar', 'Sidebar']);
  for (const p of organisms.filter((o) => ['Footer', 'Hero', 'Navbar', 'Sidebar'].includes(o.name))) {
    assert.equal(p.confidence, 'med');
    assert.equal(p.source, 'rules');
    assert.match(p.notes, /Landmarke/);
  }
  assert.deepEqual(templates, [], 'lose Landmarken ohne Gesamt-Gerüst ergeben kein Template');
});

test('detects navbar from role=navigation', () => {
  const { organisms } = recognizeComponents('<div role="navigation">x</div>');
  assert.ok(organisms.some((p) => p.name === 'Navbar'));
});

test('detects organisms: form, table, list, card', () => {
  const html = `
    <form><input type="text"></form>
    <table><tr><td>x</td></tr></table>
    <ul><li>1</li><li>2</li><li>3</li></ul>
    <div class="card">A</div><div class="card">B</div>`;
  const { organisms } = recognizeComponents(html);
  const names_ = organisms.map((c) => c.name).sort();
  assert.deepEqual(names_, ['Card', 'Formular', 'Liste', 'Tabelle']);
});

test('ignores a form without fields and a short list', () => {
  const html = '<form></form><ul><li>1</li><li>2</li></ul>';
  const { organisms } = recognizeComponents(html);
  assert.equal(organisms.length, 0);
});

test('returns the empty shape instead of throwing on pathological input', () => {
  // pass values that are not well-formed html strings; must not throw
  for (const bad of [undefined, null, 12345, { weird: true }, []]) {
    const out = recognizeComponents(bad);
    assert.deepEqual(out, { atoms: [], molecules: [], organisms: [], templates: [] });
  }
});

test('erkannte Bausteine tragen einen selector-Pfad', () => {
  const r = recognizeComponents('<div><nav><a class="btn">x</a></nav><button>Ok</button></div>');
  const btn = r.atoms.find((a) => a.name === 'Button');
  assert.ok(btn.selector && /button|nav/.test(btn.selector));
  const nav = r.organisms.find((p) => p.name === 'Navbar');
  assert.match(nav.selector, /nav/);
});

test('wiederholte Klassen-Cluster werden Kandidaten mit selector (organisms)', () => {
  const html = `<main>
    <div class="stat-card"><h3>Umsatz</h3><p>12.400 €</p></div>
    <div class="stat-card"><h3>Kunden</h3><p>87</p></div>
    <div class="row"><span>a</span><span>b</span></div>
  </main>`;
  const r = recognizeComponents(html);
  const cand = r.organisms.find((c) => c.name === 'Stat Card');
  assert.ok(cand, 'Kandidat Stat Card fehlt');
  assert.equal(cand.confidence, 'low');
  assert.equal(cand.notes, 'unerkannter Baustein-Kandidat');
  assert.ok(cand.selector.includes('div'));
  assert.ok(!r.organisms.some((c) => c.name === 'Row'), 'Layout-Klassen sind keine Kandidaten');
});

test('Tailwind-Utility-Klassen werden keine Kandidaten', () => {
  const rep = (cls) =>
    `<div class="${cls}"><span>a</span><span>b</span></div>`.repeat(2);
  const html = `<main>${rep('items-center')}${rep('rounded-xl')}${rep('py-4')}${rep(
    'justify-between'
  )}${rep('bg-white')}${rep('shadow')}${rep('text-sm')}${rep('hover:bg-gray-50')}${rep(
    'pricing-table'
  )}</main>`;
  const r = recognizeComponents(html);
  const names_ = r.organisms
    .filter((c) => c.notes === 'unerkannter Baustein-Kandidat')
    .map((c) => c.name);
  assert.deepEqual(names_, ['Pricing Table']);
});

// --- Templates ---

test('<main>-Landmarke → genau ein Template "Page Layout"', () => {
  const html = '<body><nav>n</nav><main><h1>Dashboard</h1><div class="card">A</div></main></body>';
  const { templates } = recognizeComponents(html);
  assert.equal(templates.length, 1);
  assert.equal(templates[0].name, 'Page Layout');
  assert.ok(['low', 'med'].includes(templates[0].confidence));
  assert.equal(templates[0].source, 'rules');
});

test('äußerster Container mit Nav + Inhaltsbereich (kein <main>) → ein Template', () => {
  const html = '<div class="shell"><nav>n</nav><div class="content"><p>Inhalt</p></div></div>';
  const { templates, organisms } = recognizeComponents(html);
  assert.equal(templates.length, 1);
  assert.equal(templates[0].name, 'Page Layout');
  assert.ok(organisms.some((o) => o.name === 'Navbar'));
});

test('Sidebar allein ohne umschließenden Inhaltsbereich-Container ergibt kein Template', () => {
  const html = '<aside>a</aside><div class="card">A</div>';
  const { templates } = recognizeComponents(html);
  assert.deepEqual(templates, []);
});

test('nie mehr als ein Template', () => {
  const html = `<body>
    <main><div class="shell"><nav>n</nav><div class="content">x</div></div></main>
  </body>`;
  const { templates } = recognizeComponents(html);
  assert.equal(templates.length, 1);
});
