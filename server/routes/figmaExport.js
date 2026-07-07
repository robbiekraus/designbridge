import express from 'express';
import cors from 'cors';
import { setFigmaExport, getFigmaExport } from '../lib/figmaExportStore.js';

const router = express.Router();

// Permissive CORS: the Figma plugin fetches from within Figma's sandbox
// (Origin header is `null`), so the :5173-only global CORS does not apply here.
router.use(cors({ origin: '*' }));

// Web app hands off the latest Figma payload.
router.post('/', (req, res) => {
  const body = req.body;
  if (!body || body.designbridge !== 'figma-import') {
    return res.status(400).json({ error: 'Kein gültiger DesignBridge-Figma-Export.' });
  }
  setFigmaExport(body);
  res.json({
    ok: true,
    colors: Array.isArray(body.colors) ? body.colors.length : 0,
    text: Array.isArray(body.text) ? body.text.length : 0,
  });
});

// Figma plugin pulls the latest handed-off payload.
router.get('/latest', (req, res) => {
  const latest = getFigmaExport();
  if (!latest) {
    return res.status(404).json({
      error: 'Noch kein Export bereitgestellt — in DesignBridge zuerst „An Figma senden" klicken.',
    });
  }
  res.json(latest);
});

export default router;
