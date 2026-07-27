// Zweiter, eigenständiger Dienst (eigener Railway-Service, Wurzel storybook-harness/).
// Baut auf Zuruf ein echtes Storybook aus übergebenen Bausteinen — kein Terminal für
// die Testperson nötig. Siehe docs/superpowers/specs/2026-07-24-storybook-live-preview-design.md.
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import { buildPreview, getPreviewDir } from './lib/buildPreview.js';

const BUILD_FAILED_MESSAGE = 'Storybook konnte nicht gebaut werden — bitte in UIPrism erneut versuchen.';

export function buildApp() {
  const app = express();
  const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: '5mb' }));
  // Kaputtes JSON im Body wirft vor der Route (im body-parser) — ohne diesen Handler
  // liefert Express' Default-Fehlerbehandlung einen Stacktrace mit absoluten Pfaden.
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Ungültiges JSON im Request-Body.' });
      return;
    }
    next(err);
  });

  app.get('/health', (req, res) => {
    res.json({ ok: true });
  });

  app.post('/build', async (req, res) => {
    const { components, stories, tokens, tokensCss } = req.body || {};
    if (!components || Object.keys(components).length === 0) {
      res.status(400).json({ error: 'Keine Komponenten übergeben.' });
      return;
    }
    try {
      const { id, expiresAt } = await buildPreview({ components, stories, tokens, tokensCss });
      res.json({ id, url: `/preview/${id}/`, expiresAt });
    } catch (err) {
      // Ehrliche deutsche Meldung an den Client, kein Stacktrace/Stderr — die echte
      // Fehlermeldung (kann rohes Child-Process-Stderr mit ANSI-Codes enthalten) landet
      // nur im Server-Log.
      console.error('Storybook-Build fehlgeschlagen:', err.message);
      // err.stderr/err.stdout kommen von execFile (s. buildPreview.js) und enthalten die
      // eigentliche Storybook/npm-Fehlermeldung — bisher fehlten sie in den Railway-Logs
      // komplett. Nur server-seitig loggen, die Client-Antwort bleibt unverändert.
      if (err.stderr) console.error('Storybook-Build stderr:', err.stderr);
      if (err.stdout) console.error('Storybook-Build stdout:', err.stdout);
      res.status(500).json({ error: BUILD_FAILED_MESSAGE });
    }
  });

  app.use('/preview/:id', (req, res, next) => {
    const dir = getPreviewDir(req.params.id);
    if (!dir) {
      res.status(404).send('Diese Storybook-Vorschau ist abgelaufen oder existiert nicht — bitte in UIPrism erneut auf „In Storybook öffnen" klicken.');
      return;
    }
    express.static(dir)(req, res, next);
  });

  return app;
}

// Nur einen echten Listener starten, wenn diese Datei direkt ausgeführt wird (node server.js) —
// nicht wenn server.test.js sie importiert (node --test setzt NODE_ENV nicht automatisch).
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const PORT = process.env.PORT || 4400;
  buildApp().listen(PORT, () => {
    console.log(`\n📚 Storybook-Builder läuft auf http://localhost:${PORT}\n`);
  });
}
