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
