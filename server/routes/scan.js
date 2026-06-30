import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { analyzeScreenshot } from '../lib/claude.js';
import { fetchSite } from '../lib/fetchSite.js';
import { ingestCss } from '../lib/cssIngest.js';
import { recognizeComponents } from '../lib/recognizeComponents.js';

const router = express.Router();

// Demo safety net: when DEMO_FALLBACK=1, a failed live scan (e.g. API down or
// out of credits) returns a bundled fixture instead of a 500 so a live demo
// never breaks. Disabled by default — has no effect on normal operation.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadDemoFallback(filename) {
  const raw = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../fixtures/demo-dashboard.json'), 'utf8')
  );
  raw.meta = { ...raw.meta, image_filename: filename, fallback: true };
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

// POST /api/scan/image
router.post('/image', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image uploaded' });
  }

  let extractTargets = {};
  try {
    extractTargets = req.body.extract ? JSON.parse(req.body.extract) : {};
  } catch {
    extractTargets = {};
  }

  try {
    console.log(`[scan] Analyzing ${req.file.originalname} (${(req.file.size / 1024).toFixed(0)} KB)`);

    const result = await analyzeScreenshot(
      req.file.path,
      req.file.mimetype,
      extractTargets
    );

    result.meta.image_filename = req.file.originalname;

    res.json(result);
  } catch (err) {
    console.error('[scan] Error:', err.message);
    if (process.env.DEMO_FALLBACK === '1') {
      console.warn('[scan] DEMO_FALLBACK active — returning bundled fixture instead of failing.');
      // Brief pause so the "Extracting tokens…" progress reads like a real analysis.
      await new Promise(r => setTimeout(r, 2500));
      res.json(loadDemoFallback(req.file.originalname));
    } else {
      res.status(500).json({ error: err.message });
    }
  } finally {
    // Clean up temp file
    fs.unlink(req.file.path, () => {});
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
    const { html, css } = await fetchSite(url);
    const result = ingestCss(css, { sourceUrl: url });
    const rec = recognizeComponents(html, css);
    result.atomics = rec.atomics;
    result.components = rec.components;
    result.patterns = rec.patterns;
    result.meta = { ...result.meta, source_url: url, ai_deepened: false };
    res.json(result);
  } catch (err) {
    console.error('[scan/url] Error:', err.message);
    res.status(502).json({ error: `Seite konnte nicht gelesen werden: ${err.message}` });
  }
});

export default router;
