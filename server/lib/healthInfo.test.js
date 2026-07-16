import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHealthPayload } from './healthInfo.js';

test('demo_fallback ist true, wenn DEMO_FALLBACK="1"', () => {
  const payload = buildHealthPayload({ DEMO_FALLBACK: '1' });
  assert.equal(payload.demo_fallback, true);
});

test('demo_fallback ist false, wenn DEMO_FALLBACK fehlt', () => {
  const payload = buildHealthPayload({});
  assert.equal(payload.demo_fallback, false);
});

test('demo_fallback ist false bei DEMO_FALLBACK="0"', () => {
  const payload = buildHealthPayload({ DEMO_FALLBACK: '0' });
  assert.equal(payload.demo_fallback, false);
});

test('liefert die bestehenden Felder weiter (Back-Compat)', () => {
  const payload = buildHealthPayload({ ANTHROPIC_API_KEY: 'sk-real-key' });
  assert.equal(payload.status, 'ok');
  assert.equal(payload.anthropic_key_configured, true);
  assert.equal(typeof payload.ai_key_configured, 'boolean');
  assert.equal(typeof payload.ai_provider, 'string');
  assert.equal(typeof payload.version, 'string');
});

test('anthropic_key_configured bleibt false bei Platzhalter-Key mit "..."', () => {
  const payload = buildHealthPayload({ ANTHROPIC_API_KEY: 'sk-...' });
  assert.equal(payload.anthropic_key_configured, false);
});
