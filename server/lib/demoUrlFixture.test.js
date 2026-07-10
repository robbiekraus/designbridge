// server/lib/demoUrlFixture.test.js
// Sichert: die URL-Demo-Fixture deckt alle Bausteine ab, die ein Scan der
// mitgelieferten demo-site als Kandidaten liefert (DEMO-Smoke bleibt stabil).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { recognizeComponents } from './recognizeComponents.js';

test('demo-url-interpretations deckt die demo-site-Kandidaten ab', () => {
  const html = fs.readFileSync(new URL('../../demo-site/index.html', import.meta.url), 'utf8');
  const r = recognizeComponents(html);
  const fixture = JSON.parse(
    fs.readFileSync(new URL('../fixtures/demo-url-interpretations.json', import.meta.url), 'utf8')
  );
  const have = new Set(fixture.map((f) => f.name));
  const candidates = r.components.filter((c) => c.notes === 'unerkannter Baustein-Kandidat');
  for (const c of candidates) {
    assert.ok(have.has(c.name), `Fixture-Eintrag fehlt für Kandidat "${c.name}"`);
  }
});

test('demo-url-interpretations deckt alle demo-site-Bausteine ohne Hand-Template ab', async () => {
  const html = fs.readFileSync(new URL('../../demo-site/index.html', import.meta.url), 'utf8');
  const r = recognizeComponents(html);
  const fixture = JSON.parse(
    fs.readFileSync(new URL('../fixtures/demo-url-interpretations.json', import.meta.url), 'utf8')
  );
  const have = new Set(fixture.map((f) => f.name));
  const { matchTemplate } = await import('../../web/src/lib/components/templates/registry.js');
  const all = [...r.atomics, ...r.components, ...r.patterns];
  for (const item of all) {
    if (matchTemplate(item.name)) continue;
    assert.ok(have.has(item.name), `Fixture-Eintrag fehlt für Baustein ohne Template "${item.name}"`);
  }
});

test('jeder Eintrag hat name/html/jsx, html ist script-frei', () => {
  const fixture = JSON.parse(
    fs.readFileSync(new URL('../fixtures/demo-url-interpretations.json', import.meta.url), 'utf8')
  );
  for (const e of fixture) {
    assert.equal(typeof e.name, 'string');
    assert.ok(e.name.length > 0);
    assert.ok(e.html.trim().length > 0, `${e.name}: html leer`);
    assert.equal(typeof e.jsx, 'string');
    assert.doesNotMatch(e.html, /<script/i, `${e.name}: script im html`);
    assert.doesNotMatch(e.html, /\son\w+=/i, `${e.name}: on*-Handler im html`);
  }
});
