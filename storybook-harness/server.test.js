import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { buildApp } from './server.js';
import { clearPreviews } from './lib/buildPreview.js';

// Muster: server/routes/interpret.test.js (echter Ephemeral-Port, echter fetch).
async function withBuilderServer(fn) {
  const app = buildApp();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test.after(() => clearPreviews());

test('GET /health antwortet ok', async () => {
  await withBuilderServer(async (base) => {
    const res = await fetch(`${base}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
  });
});

test('POST /build ohne components → 400 mit Klartext-Fehler', async () => {
  await withBuilderServer(async (base) => {
    const res = await fetch(`${base}/build`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /komponenten/i);
  });
});

test('POST /build mit echten Komponenten → 200 + abrufbare /preview/:id/index.html', async () => {
  await withBuilderServer(async (base) => {
    const res = await fetch(`${base}/build`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        components: {
          'Greeting.jsx': `export function Greeting({ className = "", ...props }) {
  return <div className={\`flex \${className}\`} {...props}>Hallo</div>;
}
`,
        },
        stories: {
          'Greeting.stories.jsx': `import { Greeting } from '../components/Greeting';
export default { title: 'Atoms/Greeting', component: Greeting };
export const Default = {};
`,
        },
      }),
    });
    assert.equal(res.status, 200);
    const { id, url } = await res.json();
    assert.ok(id);
    assert.equal(url, `/preview/${id}/`);

    const previewRes = await fetch(`${base}${url}index.html`);
    assert.equal(previewRes.status, 200);
  });
});

test('GET /preview/:id/ für unbekannte id → 404 mit Klartext-Meldung', async () => {
  await withBuilderServer(async (base) => {
    const res = await fetch(`${base}/preview/does-not-exist/index.html`);
    assert.equal(res.status, 404);
    const text = await res.text();
    assert.match(text, /abgelaufen|existiert nicht/i);
  });
});

test('POST /build mit kaputtem Komponenten-Code → 500 mit ehrlicher Meldung, kein Stacktrace', async () => {
  await withBuilderServer(async (base) => {
    const res = await fetch(`${base}/build`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        components: {
          'Broken.jsx': 'export function Broken( {\n  return <div>;\n}\n', // absichtlich kaputtes JSX
        },
        stories: {
          'Broken.stories.jsx': `import { Broken } from '../components/Broken';
export default { title: 'Atoms/Broken', component: Broken };
export const Default = {};
`,
        },
      }),
    });
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.error, 'Storybook konnte nicht gebaut werden — bitte in UIPrism erneut versuchen.');
    assert.doesNotMatch(body.error, /DeprecationWarning|node_modules|at \w|\x1b\[/);
  });
});

test('POST /build mit kaputtem JSON-Body → 400 mit Klartext-Fehler, kein Stacktrace', async () => {
  await withBuilderServer(async (base) => {
    const res = await fetch(`${base}/build`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{invalid json',
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /ungültiges json/i);
  });
});
