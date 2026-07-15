import test from 'node:test';
import assert from 'node:assert/strict';
import { aiProviderName, aiKeyConfigured } from './aiClient.js';

// Env-Matrix sauber setzen und immer zurückrollen.
function withEnv(vars, fn) {
  const keys = ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'AI_PROVIDER'];
  const prev = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  keys.forEach(k => delete process.env[k]);
  Object.assign(process.env, vars);
  try {
    fn();
  } finally {
    keys.forEach(k => {
      if (prev[k] !== undefined) process.env[k] = prev[k];
      else delete process.env[k];
    });
  }
}

test('Provider-Wahl: Default bleibt anthropic (bestehendes Verhalten)', () => {
  withEnv({ ANTHROPIC_API_KEY: 'sk-ant-echt' }, () => {
    assert.equal(aiProviderName(), 'anthropic');
  });
});

test('Provider-Wahl: nur Gemini-Key vorhanden → gemini', () => {
  withEnv({ GEMINI_API_KEY: 'g-key' }, () => {
    assert.equal(aiProviderName(), 'gemini');
  });
});

test('Provider-Wahl: beide Keys → anthropic, außer AI_PROVIDER erzwingt gemini', () => {
  withEnv({ ANTHROPIC_API_KEY: 'sk-ant-echt', GEMINI_API_KEY: 'g-key' }, () => {
    assert.equal(aiProviderName(), 'anthropic');
  });
  withEnv({ ANTHROPIC_API_KEY: 'sk-ant-echt', GEMINI_API_KEY: 'g-key', AI_PROVIDER: 'gemini' }, () => {
    assert.equal(aiProviderName(), 'gemini');
  });
});

test('Provider-Wahl: Platzhalter-Key (sk-ant-...) zählt nicht als konfiguriert', () => {
  withEnv({ ANTHROPIC_API_KEY: 'sk-ant-...', GEMINI_API_KEY: 'g-key' }, () => {
    assert.equal(aiProviderName(), 'gemini');
    assert.equal(aiKeyConfigured(), true);
  });
});

test('aiKeyConfigured: ohne jeden Key false, mit irgendeinem true', () => {
  withEnv({}, () => assert.equal(aiKeyConfigured(), false));
  withEnv({ ANTHROPIC_API_KEY: 'sk-ant-echt' }, () => assert.equal(aiKeyConfigured(), true));
  withEnv({ GEMINI_API_KEY: 'g-key' }, () => assert.equal(aiKeyConfigured(), true));
});
