import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('demo-repo-interpretations.json hat {name,html}-Einträge, KEIN jsx mehr (Token-Sparmaßnahme 19.07.)', () => {
  const arr = JSON.parse(fs.readFileSync(path.join(__dirname, 'demo-repo-interpretations.json'), 'utf8'));
  assert.ok(Array.isArray(arr) && arr.length > 0);
  for (const it of arr) {
    assert.equal(typeof it.name, 'string');
    assert.match(it.html, /style=/);
    assert.equal('jsx' in it, false, `${it.name}: jsx-Feld ist totes Feld, darf nicht mehr existieren`);
  }
});
