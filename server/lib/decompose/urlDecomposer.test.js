import { test } from 'node:test';
import assert from 'node:assert/strict';
import { urlDecomposer } from './urlDecomposer.js';

const HTML = `<html><body>
  <nav><a href="/">Home</a><a href="/x">X</a></nav>
  <div class="stat-card"><h3>Umsatz</h3><p>12.400 €</p></div>
  <div class="stat-card"><h3>Kunden</h3><p>87</p></div>
</body></html>`;
const CSS = `.stat-card{padding:16px;border-radius:8px}
nav{display:flex;gap:8px}
.unrelated{color:hotpink}`;

test('füllt structure mit Subtree-HTML und passendem CSS', async () => {
  const segs = await urlDecomposer.decompose({ html: HTML, css: CSS }, [
    { name: 'Stat Card', kind: 'component', selector: 'html > body > div:nth-of-type(1)' },
  ]);
  assert.equal(segs.length, 1);
  const s = segs[0];
  assert.equal(s.label, 'Stat Card');
  assert.ok(s.structure.html.includes('12.400 €'));
  assert.ok(s.structure.css.includes('.stat-card'));
  assert.ok(!s.structure.css.includes('.unrelated'));
  assert.deepEqual(s.bounds, { selector: 'html > body > div:nth-of-type(1)' });
  assert.equal(s.visual, null);
});

test('Selector-Miss → Segment ohne structure', async () => {
  const segs = await urlDecomposer.decompose({ html: HTML, css: CSS }, [
    { name: 'Ghost', kind: 'component', selector: 'html > body > article:nth-of-type(9)' },
    { name: 'NoSel', kind: 'component' },
  ]);
  assert.equal(segs[0].structure, null);
  assert.equal(segs[1].structure, null);
});

test('überlanges HTML wird gekappt', async () => {
  const big = `<html><body><div class="x">${'a'.repeat(20000)}</div></body></html>`;
  const segs = await urlDecomposer.decompose({ html: big, css: '' }, [
    { name: 'Big', kind: 'component', selector: 'html > body > div' },
  ]);
  assert.ok(segs[0].structure.html.length <= 8000);
});
