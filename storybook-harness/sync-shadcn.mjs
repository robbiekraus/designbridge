// Kopiert die API-kompatiblen shadcn/ui-Stubs aus dem Verifikations-Harness
// (web/verification/shadcn-target/components/ui) nach components/ui, damit
// gegroundete Imports (@/components/ui/button …) hier auflösen. Single Source
// bleibt web/verification — dieses Script hält components/ui driftfrei.
import { cp, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(dirname, '../web/verification/shadcn-target/components/ui');
const DST = path.resolve(dirname, 'components/ui');

async function main() {
  await mkdir(DST, { recursive: true });
  const files = (await readdir(SRC)).filter((f) => f.endsWith('.jsx'));
  for (const f of files) {
    await cp(path.join(SRC, f), path.join(DST, f));
  }
  console.log(`sync-shadcn: ${files.length} Stubs → components/ui (${files.join(', ')})`);
}

main().catch((err) => {
  console.error('sync-shadcn fehlgeschlagen:', err.message);
  process.exit(1);
});
