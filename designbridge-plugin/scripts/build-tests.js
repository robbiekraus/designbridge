// Bundles tests/*.test.ts (TypeScript, no figma global) into dist/tests/*.test.js
// so node's built-in test runner (`node --test`) can run them. Uses only the
// esbuild/typescript devDependencies already in this package — no new test
// framework introduced.
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const testsDir = path.join(__dirname, '..', 'tests');
const outDir = path.join(__dirname, '..', 'dist', 'tests');

const entryPoints = fs.existsSync(testsDir)
  ? fs
      .readdirSync(testsDir)
      .filter((f) => f.endsWith('.test.ts'))
      .map((f) => path.join(testsDir, f))
  : [];

if (entryPoints.length === 0) {
  console.log('No *.test.ts files found in tests/ — nothing to bundle.');
  process.exit(0);
}

fs.mkdirSync(outDir, { recursive: true });

esbuild.buildSync({
  entryPoints,
  outdir: outDir,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'es2020',
  logLevel: 'info',
  // esbuild 0.20's built-in node-core list predates `node:test` — keep all
  // `node:`-prefixed imports external instead of trying to bundle/rewrite them.
  external: ['node:*'],
});

console.log(`Bundled ${entryPoints.length} test file(s) into ${path.relative(process.cwd(), outDir)}`);
