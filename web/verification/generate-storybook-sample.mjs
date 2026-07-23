// Beweis-Skript (Scheibe 3): fährt emitComponents → emitStories über eine
// simulierte Interpretation und druckt einen echten, gegroundeten Baustein
// samt seiner *.stories.jsx sowie die Datei-Map des Storybook-Pakets.
// Aufruf:  node web/verification/generate-storybook-sample.mjs
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.document = dom.window.document;
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.window = dom.window;

const { emitComponents } = await import('../src/lib/emit/emitComponents.js');
const { emitStories } = await import('../src/lib/emit/emitStories.js');
const { storybookFiles } = await import('../src/lib/emit/buildStorybookZip.js');

const html = `<div style="display:flex;flex-direction:column;gap:12px;padding:24px;background:#ffffff;border:1px solid #e4e4e7;border-radius:8px">
  <label data-ds-component="Label" style="font-size:14px;font-weight:500;color:#09090b">E-Mail</label>
  <input data-ds-component="Input" style="padding:8px 12px;border:1px solid #e4e4e7;border-radius:6px" />
  <button data-ds-component="Button" data-ds-variant="default" style="background:#18181b;color:#fafafa;padding:8px 16px;border-radius:6px">Anmelden</button>
</div>`;

const result = {
  raw: {
    tokens: { colors: [{ hex: '#18181b', role: 'primary', confidence: 'high' }], typography: [], spacing: [], border_radius: [], shadows: [] },
    atoms: [{ name: 'Button', variants: ['primary'], confidence: 'high', source: 'ai' }],
    molecules: [{ name: 'Login Form', variants: [], confidence: 'high', source: 'ai' }],
    organisms: [], templates: [],
  },
  interpretations: { 'Login Form': { html, model: 'gemini' } },
};

const comps = emitComponents(result);
const loginForm = comps.find((c) => c.name === 'Login Form');

console.log('=== components/' + loginForm.filename + ' (gegroundet: ' + (loginForm.grounded.join(', ') || '—') + ') ===\n');
console.log(loginForm.code);

const story = emitStories(loginForm);
console.log('\n=== stories/' + story.filename + ' ===\n');
console.log(story.code);

console.log('\n=== Storybook-Paket (Datei-Map) ===');
for (const path of Object.keys(storybookFiles(result))) console.log('  ' + path);
