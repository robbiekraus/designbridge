import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recognizeComponents } from './recognizeComponents.js';

const names = (arr) => arr.map((x) => x.name);

test('detects a Button from <button> with variants from classes', () => {
  const html = '<button class="btn btn-primary">A</button><button class="btn btn-secondary">B</button>';
  const { atomics } = recognizeComponents(html, '');
  const btn = atomics.find((a) => a.name === 'Button');
  assert.ok(btn);
  assert.equal(btn.confidence, 'high');
  assert.equal(btn.source, 'rules');
  assert.deepEqual(btn.variants, ['primary', 'secondary']);
});

test('collapses multiple buttons into a single Button entry', () => {
  const html = '<button>A</button><button>B</button><button>C</button>';
  const { atomics } = recognizeComponents(html, '');
  assert.equal(atomics.filter((a) => a.name === 'Button').length, 1);
});

test('distinguishes Suche from Input', () => {
  const html = '<input type="search"><input type="text"><textarea></textarea>';
  const { atomics } = recognizeComponents(html, '');
  assert.ok(names(atomics).includes('Suche'));
  assert.ok(names(atomics).includes('Input'));
});

test('detects Badge from class with low confidence', () => {
  const html = '<span class="badge">Neu</span>';
  const { atomics } = recognizeComponents(html, '');
  const badge = atomics.find((a) => a.name === 'Badge');
  assert.ok(badge);
  assert.equal(badge.confidence, 'low');
});

test('detects patterns from HTML landmarks with med confidence', () => {
  const html = '<nav>n</nav><header><h1>t</h1></header><footer>f</footer><aside>a</aside>';
  const { patterns } = recognizeComponents(html, '');
  const names = patterns.map((p) => p.name);
  assert.deepEqual(names.sort(), ['Footer', 'Hero', 'Navbar', 'Sidebar']);
  for (const p of patterns) {
    assert.equal(p.confidence, 'med');
    assert.equal(p.source, 'rules');
    assert.match(p.notes, /Landmarke/);
  }
});

test('detects navbar from role=navigation', () => {
  const { patterns } = recognizeComponents('<div role="navigation">x</div>', '');
  assert.ok(patterns.some((p) => p.name === 'Navbar'));
});

test('detects composed components: form, table, list, card', () => {
  const html = `
    <form><input type="text"></form>
    <table><tr><td>x</td></tr></table>
    <ul><li>1</li><li>2</li><li>3</li></ul>
    <div class="card">A</div><div class="card">B</div>`;
  const { components } = recognizeComponents(html, '');
  const names = components.map((c) => c.name).sort();
  assert.deepEqual(names, ['Card', 'Formular', 'Liste', 'Tabelle']);
});

test('ignores a form without fields and a short list', () => {
  const html = '<form></form><ul><li>1</li><li>2</li></ul>';
  const { components } = recognizeComponents(html, '');
  assert.equal(components.length, 0);
});

test('returns the empty shape instead of throwing on pathological input', () => {
  // pass values that are not well-formed html strings; must not throw
  for (const bad of [undefined, null, 12345, { weird: true }, []]) {
    const out = recognizeComponents(bad, '');
    assert.deepEqual(out, { atomics: [], components: [], patterns: [] });
  }
});
