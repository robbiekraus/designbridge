import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { analyzeScreenshot } from '../lib/claude.js';
import { readImageDims } from '../lib/imageDims.js';
import { fetchSite } from '../lib/fetchSite.js';
import { ingestCss } from '../lib/cssIngest.js';
import { recognizeComponents } from '../lib/recognizeComponents.js';
import { recognizeWithAi } from '../lib/recognizeWithAi.js';
import { parseRepoUrl } from '../lib/repoUrl.js';
import { downloadRepoTarball } from '../lib/fetchRepoTarball.js';
import { extractRepoFiles } from '../lib/extractRepoFiles.js';
import { ingestRepoFiles } from '../lib/ingestRepoFiles.js';
import { parseFigmaUrl } from '../lib/figmaUrl.js';
import { fetchFigmaFile } from '../lib/fetchFigmaFile.js';
import { ingestFigmaFile } from '../lib/ingestFigmaFile.js';
import { deepenRepoWithAi } from '../lib/deepenRepoWithAi.js';
import { putImage } from '../lib/imageStore.js';
import { putPage } from '../lib/pageStore.js';
import { putRepo } from '../lib/repoStore.js';
import { liftRepoInventory, applyBaselinePaths } from '../lib/decompose/repoDecomposer.js';
import { buildRepoComposition } from '../lib/repoComposition.js';
import { aiKeyConfigured } from '../lib/aiClient.js';

const router = express.Router();

// Demo safety net: when DEMO_FALLBACK=1, a failed live scan (e.g. API down or
// out of credits) returns a bundled fixture instead of a 500 so a live demo
// never breaks. Disabled by default — has no effect on normal operation.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadDemoFallback(filename) {
  const raw = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../fixtures/demo-dashboard.json'), 'utf8')
  );
  raw.meta = { ...raw.meta, image_filename: filename, fallback: true, demo: true, model: 'demo-fixture' };
  return raw;
}

const upload = multer({
  dest: '/tmp/designbridge-uploads/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only PNG, JPG and WebP images are supported'));
  }
});

// Multer-Fehler (falscher Dateityp, >10 MB) als 400-JSON beantworten — sonst
// liefert Express eine HTML-Fehlerseite, an der res.json() im Web-Client
// scheitert (Safari: „The string did not match the expected pattern").
function uploadImage(req, res, next) {
  upload.single('image')(req, res, err => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}

// POST /api/scan/image
router.post('/image', uploadImage, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image uploaded' });
  }

  let extractTargets = {};
  try {
    extractTargets = req.body.extract ? JSON.parse(req.body.extract) : {};
  } catch {
    extractTargets = {};
  }

  // Ohne konfigurierten Key UND ohne Demo-Fallback klar absagen, statt den rohen
  // englischen SDK-Fehler an die UI durchzureichen (Live-Fund Railway 15.07.).
  if (!aiKeyConfigured() && process.env.DEMO_FALLBACK !== '1') {
    fs.unlink(req.file.path, () => {});
    return res.status(503).json({
      error: 'Bild-Import braucht einen KI-Schlüssel (ANTHROPIC_API_KEY oder GEMINI_API_KEY auf dem Server) — oder DEMO_FALLBACK=1 für Demo-Daten. URL- und Repo-Import funktionieren ohne.'
    });
  }

  try {
    console.log(`[scan] Analyzing ${req.file.originalname} (${(req.file.size / 1024).toFixed(0)} KB)`);

    const result = await analyzeScreenshot(
      req.file.path,
      req.file.mimetype,
      extractTargets
    );

    result.meta.image_filename = req.file.originalname;
    // Bild kurzlebig behalten, damit /api/interpret/components es ansehen kann.
    result.meta.import_id = putImage(req.file.path, req.file.mimetype);

    // Pixelmaße für die Kompositions-Canvas (raw.composition → composePlan).
    const dims = await readImageDims(req.file.path);
    if (dims) {
      result.meta.image_width = dims.width;
      result.meta.image_height = dims.height;
    } else {
      (result.warnings ??= []).push('Bildmaße nicht lesbar — quadratischer Fallback für Komposition.');
    }

    res.json(result);
  } catch (err) {
    console.error('[scan] Error:', err.message);
    if (process.env.DEMO_FALLBACK === '1') {
      try {
        console.warn('[scan] DEMO_FALLBACK active — returning bundled fixture instead of failing.');
        // Brief pause so the "Extracting tokens…" progress reads like a real analysis.
        await new Promise(r => setTimeout(r, 2500));
        const fallback = loadDemoFallback(req.file.originalname);
        fallback.meta.import_id = putImage(req.file.path, req.file.mimetype);
        return res.json(fallback);
      } catch (fallbackErr) {
        console.error('[scan] DEMO_FALLBACK failed:', fallbackErr.message);
        fs.unlink(req.file.path, () => {});
        return res.status(500).json({ error: fallbackErr.message });
      }
    } else {
      fs.unlink(req.file.path, () => {});
      // Tages-Quota (RPD) erschöpft: 429 statt generischem 500 — sofort
      // ehrlich melden, Retry-Knopf greift erst wieder nach Mitternachts-Reset.
      if (err.isDailyQuota) {
        return res.status(429).json({ error: err.message, daily_quota: true });
      }
      res.status(500).json({ error: err.message });
    }
  }
});

// POST /api/scan/url
router.post('/url', async (req, res) => {
  const url = req.body?.url;
  if (!url || !/^https?:\/\/\S+$/i.test(url)) {
    return res.status(400).json({ error: 'Bitte eine gültige http(s)-URL angeben.' });
  }
  try {
    console.log(`[scan/url] Fetching ${url}`);
    const { html, css, skippedStylesheets } = await fetchSite(url);
    const result = ingestCss(css, { sourceUrl: url });
    if (skippedStylesheets > 0) {
      result.warnings.push(`${skippedStylesheets} Stylesheet(s) waren nicht lesbar und wurden übersprungen — einzelne Tokens können fehlen.`);
    }
    const rec = recognizeComponents(html);
    result.atoms = rec.atoms;
    result.molecules = rec.molecules;
    result.organisms = rec.organisms;
    result.templates = rec.templates;
    result.meta = { ...result.meta, ai_deepened: false, import_id: putPage(html, css) };
    res.json(result);
  } catch (err) {
    console.error('[scan/url] Error:', err.message);
    // 'fetch failed' (DNS/Netz) ist Technik-Kauderwelsch — verständlich übersetzen.
    const msg = /fetch failed/i.test(err.message) ? 'Website nicht erreichbar — bitte URL prüfen.' : err.message;
    res.status(502).json({ error: `Seite konnte nicht gelesen werden: ${msg}` });
  }
});

// POST /api/scan/url/ai — optional Claude pass over the rule list
router.post('/url/ai', async (req, res) => {
  const url = req.body?.url;
  if (!url || !/^https?:\/\/\S+$/i.test(url)) {
    return res.status(400).json({ error: 'Bitte eine gültige http(s)-URL angeben.' });
  }
  try {
    console.log(`[scan/url/ai] Deepening ${url}`);
    const { html, css } = await fetchSite(url);
    const result = ingestCss(css, { sourceUrl: url });
    const baseline = recognizeComponents(html);
    const merged = await recognizeWithAi(html, css, baseline);
    result.atoms = merged.atoms;
    result.molecules = merged.molecules;
    result.organisms = merged.organisms;
    result.templates = merged.templates;
    result.warnings = [...(result.warnings || []), ...(merged.warnings || [])];
    result.meta = { ...result.meta, ai_deepened: true };
    res.json(result);
  } catch (err) {
    console.error('[scan/url/ai] Error:', err.message);
    // Tages-Quota (RPD) erschöpft: 429 statt generischem 502.
    if (err.isDailyQuota) {
      return res.status(429).json({ error: err.message, daily_quota: true });
    }
    const msg = /fetch failed/i.test(err.message) ? 'Website nicht erreichbar — bitte URL prüfen.' : err.message;
    res.status(502).json({ error: `Seite oder KI-Analyse fehlgeschlagen: ${msg}` });
  }
});

function statusForRepoError(err) {
  const m = err?.message || '';
  if (/nicht gefunden/i.test(m)) return 404;
  if (/zu groß/i.test(m)) return 413;
  if (/rate-limit/i.test(m)) return 429;
  return 502;
}

// POST /api/scan/repo — deterministisches Repo-Inventar (0 Credits)
router.post('/repo', async (req, res) => {
  let parsed;
  try {
    parsed = parseRepoUrl(req.body?.url);
  } catch {
    return res.status(400).json({ error: 'Bitte eine öffentliche GitHub-URL angeben (github.com/owner/repo).' });
  }
  const branch = String(req.body?.branch ?? '').trim() || parsed.branch || null;
  try {
    console.log(`[scan/repo] Loading ${parsed.owner}/${parsed.repo}${branch ? `@${branch}` : ''}`);
    const { buffer, branch: usedBranch } = await downloadRepoTarball({ ...parsed, branch });
    const files = await extractRepoFiles(buffer);
    const result = ingestRepoFiles(files, { sourceUrl: req.body.url, branch: usedBranch });
    // Echten Quellcode (capped) in atoms/molecules/organisms heben — templates tragen keinen Code.
    await liftRepoInventory(files, [...result.atoms, ...result.molecules, ...result.organisms]);
    // Volle Dateien im Store für die spätere on-demand-Interpretation.
    result.meta = { ...result.meta, import_id: putRepo(files, { sourceUrl: req.body.url, branch: usedBranch }) };
    res.json(result);
  } catch (err) {
    console.error('[scan/repo] Error:', err.message);
    res.status(statusForRepoError(err)).json({ error: err.message });
  }
});

// POST /api/scan/repo/ai — optional Claude pass over the repo rule list
router.post('/repo/ai', async (req, res) => {
  let parsed;
  try {
    parsed = parseRepoUrl(req.body?.url);
  } catch {
    return res.status(400).json({ error: 'Bitte eine öffentliche GitHub-URL angeben (github.com/owner/repo).' });
  }
  const branch = String(req.body?.branch ?? '').trim() || parsed.branch || null;
  try {
    console.log(`[scan/repo/ai] Deepening ${parsed.owner}/${parsed.repo}${branch ? `@${branch}` : ''}`);
    // Stateless: Repo erneut laden — der Client bleibt dumm, keine client-gesendete Liste.
    const { buffer, branch: usedBranch } = await downloadRepoTarball({ ...parsed, branch });
    const files = await extractRepoFiles(buffer);
    const result = ingestRepoFiles(files, { sourceUrl: req.body.url, branch: usedBranch });
    const baseline = {
      atoms: result.atoms, molecules: result.molecules, organisms: result.organisms, templates: result.templates,
    };
    const merged = await deepenRepoWithAi(files, baseline);
    result.atoms = merged.atoms;
    result.molecules = merged.molecules;
    result.organisms = merged.organisms;
    result.templates = merged.templates;
    result.warnings = [...(result.warnings || []), ...(merged.warnings || [])];
    // Wie /repo: Code heben + Dateien im Store — sonst verliert „Mit KI vertiefen"
    // den gehobenen Code UND das import_id (→ Interpretation danach unmöglich).
    // deepenRepoWithAi droppt `path` (Schema kennt keinen) → erst per Name aus der
    // Baseline zurückmappen, sonst ist der Lift ein No-op (FF1).
    const mergedInv = [...result.atoms, ...result.molecules, ...result.organisms];
    applyBaselinePaths(mergedInv, [...baseline.atoms, ...baseline.molecules, ...baseline.organisms]);
    // deepenRepoWithAi droppt path auch bei templates (gleiches Schema-Problem
    // wie bei atoms/molecules/organisms) — sonst bleiben Layout/Seiten-Kanten
    // nach "Mit KI vertiefen" wieder unauffindbar (Spec 2026-07-18-repo-composition-extraction).
    applyBaselinePaths(result.templates, baseline.templates);
    await liftRepoInventory(files, mergedInv);
    // Komposition neu ableiten: die KI kann Bausteine umbenennen/ergänzen —
    // die von ingestRepoFiles gelieferte composition spiegelt noch die
    // Baseline-Namen, nicht den gemergten Bestand.
    const filesByPath = Object.fromEntries(files.map((f) => [f.path, f.content]));
    result.composition = buildRepoComposition(
      [...mergedInv, ...result.templates],
      filesByPath,
    );
    result.meta = {
      ...result.meta, model: 'repo-ingest+ai', ai_deepened: true,
      import_id: putRepo(files, { sourceUrl: req.body.url, branch: usedBranch }),
    };
    res.json(result);
  } catch (err) {
    console.error('[scan/repo/ai] Error:', err.message);
    // Tages-Quota (RPD) erschöpft: 429 statt statusForRepoError-Fallback (502).
    if (err.isDailyQuota) {
      return res.status(429).json({ error: err.message, daily_quota: true });
    }
    res.status(statusForRepoError(err)).json({ error: `Repo- oder KI-Analyse fehlgeschlagen: ${err.message}` });
  }
});

function statusForFigmaError(err) {
  const m = err?.message || '';
  if (/Token ungültig/i.test(m)) return 403;
  if (/nicht gefunden/i.test(m)) return 404;
  if (/Rate-Limit/i.test(m)) return 429;
  return 502;
}

// POST /api/scan/figma — Tokens & Inventar aus einer Figma-Datei (REST API, kein Plugin nötig)
router.post('/figma', async (req, res) => {
  let parsed;
  try {
    parsed = parseFigmaUrl(req.body?.url);
  } catch {
    return res.status(400).json({ error: 'Bitte eine gültige Figma-Datei-URL angeben (figma.com/design/…).' });
  }
  const token = req.body?.token || process.env.FIGMA_TOKEN;
  if (!token) {
    return res.status(400).json({ error: 'Kein Figma-Token — in .env als FIGMA_TOKEN setzen oder im Feld eingeben.' });
  }
  try {
    console.log(`[scan/figma] Loading ${parsed.fileKey}`);
    const file = await fetchFigmaFile({ fileKey: parsed.fileKey, token });
    const result = ingestFigmaFile(file, { sourceUrl: req.body.url });
    res.json(result);
  } catch (err) {
    console.error('[scan/figma] Error:', err.message);
    res.status(statusForFigmaError(err)).json({ error: err.message });
  }
});

export default router;

// GET /api/figma/status — sagt der Web-UI, ob ein serverseitiges FIGMA_TOKEN
// konfiguriert ist (dann kein Token-Feld im Import-Modal nötig). Als eigener
// Handler exportiert und in index.js unter /api/figma/status montiert, statt
// den ganzen scanRouter ein zweites Mal zu mounten (das würde alle Scan-Routen
// doppelt exponieren).
export function figmaStatusHandler(req, res) {
  res.json({ tokenConfigured: !!process.env.FIGMA_TOKEN });
}
