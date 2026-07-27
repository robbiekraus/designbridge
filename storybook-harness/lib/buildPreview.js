// Baut pro Anfrage ein isoliertes, echtes Storybook aus übergebenen Komponenten+Stories.
// Muster für die TTL-Verwaltung: server/lib/repoStore.js (In-Memory-Map, randomBytes-ID,
// setTimeout+unref). Neu hier: echte Dateisystem-Seiteneffekte (Verzeichnis, Build).
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile, readFile, cp, rm, symlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

// lib/buildPreview.js → eine Ebene hoch = Harness-Wurzel (Quelle des Scaffolds).
const HARNESS_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const TTL_MS = 30 * 60 * 1000;
const BUILD_TIMEOUT_MS = 60_000;

// lib/tailwindTokens.js muss mit rein: tailwind.config.js importiert es relativ
// (`./lib/tailwindTokens.js`) und dieser Import wird erst im Arbeitsordner aufgelöst.
const SCAFFOLD_FILES = ['package.json', 'globals.css', 'tailwind.config.js', 'postcss.config.js', 'lib/tailwindTokens.js'];
const SCAFFOLD_DIRS = [
  ['.storybook', '.storybook'],
  ['components/ui', 'components/ui'],
];

const entries = new Map(); // id -> { workDir, staticDir, timer }

export async function buildPreview(
  { components, stories, tokens, tokensCss },
  { ttlMs = TTL_MS, harnessDir = HARNESS_DIR } = {},
) {
  if (!components || Object.keys(components).length === 0) {
    throw new Error('Keine Komponenten übergeben — nichts zu bauen.');
  }

  const id = crypto.randomBytes(8).toString('hex');
  const workDir = path.join(os.tmpdir(), 'storybook-preview', id);

  try {
    await mkdir(path.join(workDir, 'components'), { recursive: true });
    await mkdir(path.join(workDir, 'stories'), { recursive: true });
    await mkdir(path.join(workDir, 'lib'), { recursive: true });

    for (const [filename, code] of Object.entries(components)) {
      await writeFile(path.join(workDir, 'components', filename), code, 'utf8');
    }
    for (const [filename, code] of Object.entries(stories || {})) {
      await writeFile(path.join(workDir, 'stories', filename), code, 'utf8');
    }

    for (const rel of SCAFFOLD_FILES) {
      await cp(path.join(harnessDir, rel), path.join(workDir, rel));
    }
    for (const [src, dest] of SCAFFOLD_DIRS) {
      await cp(path.join(harnessDir, src), path.join(workDir, dest), { recursive: true });
    }
    await symlink(path.join(harnessDir, 'node_modules'), path.join(workDir, 'node_modules'), 'dir');

    // Scan-Tokens des Imports (optional — Preview-Importe ohne Rohdaten liefern beides
    // nicht mit): tailwind.config.js im Arbeitsordner liest tailwind.tokens.js, WENN sie da
    // ist (s. tailwind.config.js/lib/tailwindTokens.js) — ohne die beiden Felder bleibt das
    // Verhalten exakt wie heute (nur das shadcn-Default-Theme, kein tokens.css-Import).
    if (tokens) {
      await writeFile(path.join(workDir, 'tailwind.tokens.js'), tokens, 'utf8');
    }
    if (tokensCss) {
      await writeFile(path.join(workDir, 'tokens.css'), tokensCss, 'utf8');
      const previewJsPath = path.join(workDir, '.storybook', 'preview.js');
      const previewJs = await readFile(previewJsPath, 'utf8');
      await writeFile(previewJsPath, `import '../tokens.css';\n${previewJs}`, 'utf8');
    }

    // CI=true + --disable-telemetry: unterdrückt Storybooks interaktiven Crash-Report-Prompt
    // ("Would you like to help improve Storybook..."), der bei kaputtem Input sonst mangels
    // TTY-Stdin bis zum Timeout hängt statt sauber+schnell zu scheitern (live beobachtet: 60s
    // Hänger bei kaputtem JSX, siehe Task-3-Test unten).
    await execFileAsync('npx', ['storybook', 'build', '--disable-telemetry'], {
      cwd: workDir,
      timeout: BUILD_TIMEOUT_MS,
      env: { ...process.env, CI: 'true' },
    });
  } catch (err) {
    await rm(workDir, { recursive: true, force: true });
    const wrapped = new Error(`Storybook konnte nicht gebaut werden: ${err.message}`);
    // execFile-Fehler tragen das echte Storybook/npm-stderr+stdout — das ist genau die
    // Information, die in den Railway-Logs bisher fehlte (nur err.message landete dort).
    // Client sieht das weiterhin nie (server.js loggt es nur server-seitig, s. dort).
    wrapped.stderr = err.stderr;
    wrapped.stdout = err.stdout;
    throw wrapped;
  }

  const staticDir = path.join(workDir, 'storybook-static');
  const timer = setTimeout(() => removePreview(id), ttlMs);
  if (timer.unref) timer.unref();
  entries.set(id, { workDir, staticDir, timer });

  return { id, staticDir, expiresAt: Date.now() + ttlMs };
}

export function getPreviewDir(id) {
  const e = entries.get(id);
  return e ? e.staticDir : null;
}

export function removePreview(id) {
  const e = entries.get(id);
  if (!e) return;
  clearTimeout(e.timer);
  entries.delete(id);
  rm(e.workDir, { recursive: true, force: true }).catch(() => {});
}

export function clearPreviews() {
  for (const id of [...entries.keys()]) removePreview(id);
}
