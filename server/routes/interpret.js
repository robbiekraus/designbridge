// server/routes/interpret.js
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getImage } from '../lib/imageStore.js';
import { interpretComponents } from '../lib/interpretComponents.js';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Demo safety net analog scan.js: bei DEMO_FALLBACK=1 liefert ein gescheiterter
// Live-Call die gebündelten Fixture-Interpretationen statt eines 502.
function loadDemoInterpretations(requestedNames) {
  const all = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../fixtures/demo-interpretations.json'), 'utf8')
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
  if (!image) {
    return res.status(410).json({ error: 'Bild nicht mehr verfügbar — bitte erneut importieren.' });
  }
  try {
    console.log(`[interpret] ${components.length} Bausteine für Import ${importId}`);
    const result = await interpretComponents(image.path, image.mimetype, components);
    res.json(result);
  } catch (err) {
    console.error('[interpret] Error:', err.message);
    if (process.env.DEMO_FALLBACK === '1') {
      try {
        console.warn('[interpret] DEMO_FALLBACK active — returning bundled interpretations.');
        return res.json(loadDemoInterpretations(components.map((c) => c.name)));
      } catch (fallbackErr) {
        console.error('[interpret] DEMO_FALLBACK failed:', fallbackErr.message);
        return res.status(502).json({ error: 'KI-Interpretation fehlgeschlagen — bitte später erneut versuchen.' });
      }
    }
    res.status(502).json({ error: 'KI-Interpretation fehlgeschlagen — bitte später erneut versuchen.' });
  }
});

export default router;
