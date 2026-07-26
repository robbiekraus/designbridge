// Bündelt die ECHTE Sortierfunktion des Writers als ESM, damit
// web/verification/build-order-in-browser.html sie gegen einen echten Payload
// fahren kann — statt sie im Browser nachzubauen (eine Nachbildung würde genau
// die Abweichung nicht finden, um die es geht).
const esbuild = require('esbuild');
const path = require('path');

const out = path.join(__dirname, '../../web/verification/buildOrder.mjs');
esbuild.buildSync({
  entryPoints: [path.join(__dirname, '../src/writer/buildOrder.ts')],
  bundle: true,
  format: 'esm',
  outfile: out,
  banner: { js: '// GENERIERT — nicht von Hand ändern. Quelle: designbridge-plugin/src/writer/buildOrder.ts\n// Neu bauen: cd designbridge-plugin && npm run bundle-build-order' },
});
console.log('→', path.relative(process.cwd(), out));
