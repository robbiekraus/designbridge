const esbuild = require('esbuild');
const fs = require('fs');

const isWatch = process.argv.includes('--watch');

const sharedConfig = {
  bundle: true,
  target: 'es2017',
  logLevel: 'info',
};

function inlineScriptIntoHTML() {
  const html = fs.readFileSync('src/ui.html', 'utf8');
  const js = fs.readFileSync('dist/ui.js', 'utf8');
  const inlined = html.replace(
    /<script src="ui\.js"><\/script>/,
    `<script>\n${js}\n</script>`
  );
  fs.writeFileSync('dist/ui.html', inlined);
}

async function build() {
  if (!fs.existsSync('dist')) fs.mkdirSync('dist');

  // Figma sandbox (browser-like, no node globals)
  const mainCtx = await esbuild.context({
    ...sharedConfig,
    platform: 'browser',
    entryPoints: ['src/main.ts'],
    outfile: 'dist/main.js',
    define: { 'global': 'globalThis' },
  });

  // Plugin UI (browser)
  const uiCtx = await esbuild.context({
    ...sharedConfig,
    platform: 'browser',
    entryPoints: ['src/ui.ts'],
    outfile: 'dist/ui.js',
  });

  // Codegen CLI (node)
  const codegenCtx = await esbuild.context({
    ...sharedConfig,
    platform: 'node',
    entryPoints: ['codegen/generate.ts'],
    outfile: 'dist/codegen.js',
  });

  if (isWatch) {
    const rebuildAll = async () => {
      await Promise.all([mainCtx.rebuild(), uiCtx.rebuild(), codegenCtx.rebuild()]);
      inlineScriptIntoHTML();
      console.log('Rebuilt.');
    };
    await rebuildAll();
    fs.watch('src', { recursive: true }, async () => {
      try { await rebuildAll(); } catch (e) { console.error(e); }
    });
    console.log('Watching for changes...');
  } else {
    await Promise.all([mainCtx.rebuild(), uiCtx.rebuild(), codegenCtx.rebuild()]);
    inlineScriptIntoHTML();
    await Promise.all([mainCtx.dispose(), uiCtx.dispose(), codegenCtx.dispose()]);
    console.log('Build complete.');
  }
}

build().catch((err) => { console.error(err); process.exit(1); });
