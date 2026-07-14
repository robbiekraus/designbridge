import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('demo-repo-interpretations.json hat {name,html,jsx}-Einträge', () => {
  const arr = JSON.parse(fs.readFileSync(path.join(__dirname, 'demo-repo-interpretations.json'), 'utf8'));
  assert.ok(Array.isArray(arr) && arr.length > 0);
  for (const it of arr) {
    assert.equal(typeof it.name, 'string');
    assert.match(it.html, /style=/);
    assert.equal(typeof it.jsx, 'string');
  }
});
