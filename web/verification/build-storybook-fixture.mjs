// Baut die synthetische Demo-Fixture fürs Storybook-Harness: fährt den ECHTEN
// Emit-Pfad (emitComponents → storybookFiles) über eine simulierte Interpretation
// und schreibt das Ergebnis als storybook-harness/fixtures/sample-export.zip.
// So bleibt die Fixture driftfrei zum realen Export (kein handgeschriebener Code).
//
// Aufruf (aus dem web/-Verzeichnis, nach `npm install`):
//   node verification/build-storybook-fixture.mjs
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import JSZip from 'jszip';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.document = dom.window.document;
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.window = dom.window;

const { storybookFiles } = await import('../src/lib/emit/buildStorybookZip.js');

// Ein realistischer kleiner Scan: gegroundetes Login-Formular (Label/Input/Button
// lösen gegen den shadcn-Katalog auf) + ein eigenständiger Button-Atom.
const loginHtml = `<div style="display:flex;flex-direction:column;gap:12px;padding:24px;background:#ffffff;border:1px solid #e4e4e7;border-radius:8px">
  <label data-ds-component="Label" style="font-size:14px;font-weight:500;color:#09090b">E-Mail</label>
  <input data-ds-component="Input" style="padding:8px 12px;border:1px solid #e4e4e7;border-radius:6px" />
  <label data-ds-component="Label" style="font-size:14px;font-weight:500;color:#09090b">Passwort</label>
  <input data-ds-component="Input" style="padding:8px 12px;border:1px solid #e4e4e7;border-radius:6px" />
  <button data-ds-component="Button" data-ds-variant="default" style="background:#18181b;color:#fafafa;padding:8px 16px;border-radius:6px">Anmelden</button>
</div>`;

// Der Atom heißt bewusst NICHT „Button" — Namen mit butt/btn/cta würden das
// Button-*Template* treffen (Template-Emit rendert ohne Children eine leere Hülle).
// „Primary Action" umgeht das Template → geht durch die Interpretation → wird gegen
// den shadcn-Katalog gegroundet und rendert einen echten <Button>Speichern</Button>.
const actionHtml = `<button data-ds-component="Button" data-ds-variant="default" style="background:#18181b;color:#fafafa;padding:8px 16px;border-radius:6px">Speichern</button>`;

const result = {
  raw: {
    tokens: {
      colors: [{ hex: '#18181b', role: 'primary', confidence: 'high' }],
      typography: [], spacing: [], border_radius: [], shadows: [],
    },
    atoms: [{ name: 'Primary Action', variants: [], confidence: 'high', source: 'ai' }],
    molecules: [{ name: 'Login Form', variants: [], confidence: 'high', source: 'ai' }],
    organisms: [], templates: [],
  },
  interpretations: {
    'Primary Action': { html: actionHtml, model: 'gemini' },
    'Login Form': { html: loginHtml, model: 'gemini' },
  },
};

const files = storybookFiles(result);
const zip = new JSZip();
for (const [p, content] of Object.entries(files)) zip.file(p, content);
const buffer = await zip.generateAsync({ type: 'nodebuffer' });

const outDir = path.resolve(dirname, '../../storybook-harness/fixtures');
await mkdir(outDir, { recursive: true });
const outPath = path.join(outDir, 'sample-export.zip');
await writeFile(outPath, buffer);

console.log(`Fixture geschrieben: ${outPath}`);
console.log(`Enthaltene Dateien:\n  ${Object.keys(files).join('\n  ')}`);
