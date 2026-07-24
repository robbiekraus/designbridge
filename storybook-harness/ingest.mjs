// Ingest: entpackt ein UIPrism-Export-Paket (designbridge-storybook.zip) in dieses
// Harness. Aus dem ZIP werden NUR components/ und stories/ übernommen — die eigene,
// stabile Storybook-Konfig (.storybook, globals.css, components/ui) bleibt.
//
// Aufruf:
//   node ingest.mjs <pfad-zur-zip>        // eigener Export (z. B. ~/Downloads/…)
//   node ingest.mjs --fixture sample      // mitgelieferte synthetische Fixture
//   node ingest.mjs --fixture prod        // eingefrorener echter Prod-Scan
import { readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const JSZip = require('jszip');

const dirname = path.dirname(fileURLToPath(import.meta.url));
const STORIES_DIR = path.join(dirname, 'stories');
const COMPONENTS_DIR = path.join(dirname, 'components');

const FIXTURES = {
  sample: path.join(dirname, 'fixtures', 'sample-export.zip'),
  prod: path.join(dirname, 'fixtures', 'prod-export.zip'),
};

function resolveZipPath(argv) {
  const fixIdx = argv.indexOf('--fixture');
  if (fixIdx !== -1) {
    const key = argv[fixIdx + 1];
    if (!FIXTURES[key]) throw new Error(`Unbekannte Fixture '${key}'. Erlaubt: ${Object.keys(FIXTURES).join(', ')}`);
    return FIXTURES[key];
  }
  const positional = argv.find((a) => !a.startsWith('--'));
  if (!positional) throw new Error('Kein ZIP angegeben. Nutze: node ingest.mjs <zip> | --fixture sample|prod');
  return positional;
}

// stories/ komplett leeren; components/ leeren, aber components/ui (Stubs) behalten.
async function clean() {
  await rm(STORIES_DIR, { recursive: true, force: true });
  await mkdir(STORIES_DIR, { recursive: true });
  await mkdir(COMPONENTS_DIR, { recursive: true });
  for (const entry of await readdir(COMPONENTS_DIR)) {
    if (entry === 'ui') continue;
    await rm(path.join(COMPONENTS_DIR, entry), { recursive: true, force: true });
  }
}

async function main() {
  const zipPath = resolveZipPath(process.argv.slice(2));
  let buf;
  try {
    buf = await readFile(zipPath);
  } catch (err) {
    if (err.code === 'ENOENT' && zipPath === FIXTURES.prod) {
      throw new Error(
        'fixtures/prod-export.zip fehlt noch. So erzeugen: in UIPrism (Prod) scannen → '
        + '"Nach Storybook exportieren" → die ZIP nach storybook-harness/fixtures/prod-export.zip legen. '
        + 'Bis dahin: npm run storybook:demo (synthetische Fixture).',
      );
    }
    if (err.code === 'ENOENT') throw new Error(`ZIP nicht gefunden: ${zipPath}`);
    throw err;
  }
  const zip = await JSZip.loadAsync(buf);

  await clean();

  let n = 0;
  for (const [name, file] of Object.entries(zip.files)) {
    if (file.dir) continue;
    // Nur components/ und stories/ aus dem Paket übernehmen.
    const isComponent = name.startsWith('components/') && !name.startsWith('components/ui/');
    const isStory = name.startsWith('stories/');
    if (!isComponent && !isStory) continue;
    const dest = path.join(dirname, name);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, await file.async('nodebuffer'));
    n += 1;
  }

  console.log(`ingest: ${n} Dateien aus ${path.basename(zipPath)} → components/ + stories/`);
  if (n === 0) console.warn('  ⚠  Paket enthielt keine components/ oder stories/ — leeres Storybook.');
}

main().catch((err) => {
  console.error('ingest fehlgeschlagen:', err.message);
  process.exit(1);
});
