import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST() {
  const cwd = process.cwd();
  const publicDataDir = path.join(cwd, 'public', 'data');

  const emptyManifest = JSON.stringify({
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    components: [],
  }, null, 2);

  const emptyTokens = JSON.stringify({
    color: {},
    typography: {},
  }, null, 2);

  fs.writeFileSync(path.join(publicDataDir, 'components.manifest.json'), emptyManifest);
  fs.writeFileSync(path.join(publicDataDir, 'tokens.json'), emptyTokens);

  return NextResponse.json({ success: true });
}
