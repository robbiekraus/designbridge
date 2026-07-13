// server/routes/interpret.js
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getImage } from '../lib/imageStore.js';
import { getPage } from '../lib/pageStore.js';
import { interpretComponents } from '../lib/interpretComponents.js';
import { getDecomposer } from '../lib/decompose/index.js';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Demo safety net analog scan.js: bei DEMO_FALLBACK=1 liefert ein gescheiterter
// Live-Call die gebündelten Fixture-Interpretationen statt eines 502.
function loadDemoInterpretations(requestedNames, file = 'demo-interpretations.json') {
  const all = JSON.parse(
    fs.readFileSync(path.join(__dirname, `../fixtures/${file}`), 'utf8')
  );
  const byName = new Map(all.map((i) => [i.name, i]));
  const interpretations = [];
  const failed = [];
  for (const name of requestedNames) {
    const it = byName.get(name);
    if (it) interpretations.push(it);
    else failed.push(name);
  }
  return { interpretations, failed };
}

// POST /api/interpret/components
router.post('/components', async (req, res) => {
  const { import_id: importId, components } = req.body ?? {};
  if (!importId || !Array.isArray(components) || components.length === 0) {
    return res.status(400).json({ error: 'import_id und components sind erforderlich.' });
  }
  const image = getImage(importId);
  const page = image ? null : getPage(importId);
  if (!image && !page) {
    return res.status(410).json({ error: 'Quelle nicht mehr verfügbar — bitte erneut importieren.' });
  }
  const kind = image ? 'image' : 'url';
  try {
    console.log(`[interpret] ${components.length} Bausteine für Import ${importId}`);
    const segments = await getDecomposer(kind).decompose(
      image ? { imagePath: image.path, mimetype: image.mimetype } : { html: page.html, css: page.css },
      components,
    );
    const result = await interpretComponents(image?.path ?? null, image?.mimetype ?? null, segments);
    res.json(result);
  } catch (err) {
    console.error('[interpret] Error:', err.message);
    if (process.env.DEMO_FALLBACK === '1') {
      try {
        console.warn('[interpret] DEMO_FALLBACK active — returning bundled interpretations.');
        const file = kind === 'url' ? 'demo-url-interpretations.json' : 'demo-interpretations.json';
        return res.json(loadDemoInterpretations(components.map((c) => c.name), file));
      } catch (fallbackErr) {
        console.error('[interpret] DEMO_FALLBACK failed:', fallbackErr.message);
        return res.status(502).json({ error: 'KI-Interpretation fehlgeschlagen — bitte später erneut versuchen.' });
      }
    }
    res.status(502).json({ error: 'KI-Interpretation fehlgeschlagen — bitte später erneut versuchen.' });
  }
});

export default router;
