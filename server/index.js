import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import scanRouter, { figmaStatusHandler } from './routes/scan.js';
import figmaExportRouter from './routes/figmaExport.js';
import interpretRouter from './routes/interpret.js';
import { aiKeyConfigured, aiProviderName } from './lib/aiClient.js';
import { buildHealthPayload } from './lib/healthInfo.js';

const app = express();
const PORT = process.env.PORT || 3047;

// CORS-Origin konfigurierbar: lokal Vite (5173), in Prod läuft das Web same-origin
// (vom selben Express-Server ausgeliefert), daher ist CORS dort ohnehin unkritisch.
const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
app.use(cors({ origin: corsOrigin }));
// 2mb statt 100kb-Default: der Figma-Export-Payload (v2, angereicherte Pläne + SVG-Markup,
// je SVG bis 20k Zeichen gekappt) liegt real bei ~150kb — Default-Limit warf 413 (E2E-Fund 13.07.).
app.use(express.json({ limit: '2mb' }));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use('/demo', express.static(path.join(__dirname, '../demo-site')));

// Health check
app.get('/api/health', (req, res) => {
  res.json(buildHealthPayload());
});

app.use('/api/scan', scanRouter);
// POST /api/scan/figma ist der Haupt-Import-Pfad (Teil des scanRouter).
// GET /api/figma/status als eigener Handler, damit nicht der ganze scanRouter
// ein zweites Mal unter /api/figma landet (das würde alle Scan-Routen doppeln).
app.get('/api/figma/status', figmaStatusHandler);
app.use('/api/figma-export', figmaExportRouter);
app.use('/api/interpret', interpretRouter);

// Produktion: das gebaute Web-Frontend aus web/dist ausliefern + SPA-Fallback.
// Muss NACH den /api-Routen stehen, damit der Catch-all die API nicht überschattet.
// Lokal (npm run dev) bleibt unberührt — dort serviert Vite auf :5173.
if (process.env.NODE_ENV === 'production') {
  const webDist = path.join(__dirname, '../web/dist');
  app.use(express.static(webDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`\n🌉 Designbridge server running on http://localhost:${PORT}`);
  if (!aiKeyConfigured()) {
    console.warn('⚠️  Kein KI-Key gesetzt (ANTHROPIC_API_KEY oder GEMINI_API_KEY) — Bild-Scan & KI-Vertiefen laufen nur mit DEMO_FALLBACK=1');
  } else {
    console.log(`✓  KI-Provider: ${aiProviderName()}`);
  }
  console.log('');
});
