import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import scanRouter from './routes/scan.js';
import figmaExportRouter from './routes/figmaExport.js';

const app = express();
const PORT = process.env.PORT || 3047;

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use('/demo', express.static(path.join(__dirname, '../demo-site')));

// Health check
app.get('/api/health', (req, res) => {
  const hasKey = !!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY.includes('...');
  res.json({
    status: 'ok',
    anthropic_key_configured: hasKey,
    version: '0.1.0'
  });
});

app.use('/api/scan', scanRouter);
app.use('/api/figma-export', figmaExportRouter);

app.listen(PORT, () => {
  console.log(`\n🌉 Designbridge server running on http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY.includes('...')) {
    console.warn('⚠️  ANTHROPIC_API_KEY not set — add it to your .env file');
  } else {
    console.log('✓  Anthropic API key configured');
  }
  console.log('');
});
