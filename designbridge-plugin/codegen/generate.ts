import * as fs from 'fs';
import * as path from 'path';
import type { ComponentsManifest, TokensFile } from '../src/types/manifest';
import { generateComponentFile, toFilename, toPascalCase } from './templates';
import { flattenTokens, buildValueMap, generateCSS, generateTS } from './generate-tokens';

// ─── CLI args ─────────────────────────────────────────────────────────────────

function parseArgs(): { manifestPath: string; outDir: string } {
  const args = process.argv.slice(2);
  let manifestPath = path.resolve('components.manifest.json');
  let outDir = path.resolve('src', 'components');

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--manifest' && args[i + 1]) manifestPath = path.resolve(args[++i]);
    else if (args[i] === '--out' && args[i + 1]) outDir = path.resolve(args[++i]);
  }
  return { manifestPath, outDir };
}

// ─── Index file ───────────────────────────────────────────────────────────────

function generateIndexFile(names: string[]): string {
  return (
    names
      .map((n) => {
        const pascal = toPascalCase(n);
        const file = toFilename(n).replace('.tsx', '');
        return `export { default as ${pascal}, type ${pascal}Props } from './${file}';`;
      })
      .join('\n') + '\n'
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { manifestPath, outDir } = parseArgs();

  if (!fs.existsSync(manifestPath)) {
    console.error(`[DesignBridge] Manifest not found: ${manifestPath}`);
    process.exit(1);
  }

  const manifest: ComponentsManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const { components } = manifest;

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // Load tokens.json from the same directory as the manifest
  const tokensPath = path.join(path.dirname(manifestPath), 'tokens.json');
  let valueMap = new Map<string, string>();

  if (fs.existsSync(tokensPath)) {
    const tokens: TokensFile = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
    const flat = flattenTokens(tokens);
    valueMap = buildValueMap(flat);

    // Write tokens.css
    const cssPath = path.join(outDir, 'tokens.css');
    fs.writeFileSync(cssPath, generateCSS(tokens), 'utf8');
    console.log(`[DesignBridge] tokens.css → ${cssPath}`);

    // Write tokens.ts
    const tsPath = path.join(outDir, 'tokens.ts');
    fs.writeFileSync(tsPath, generateTS(tokens), 'utf8');
    console.log(`[DesignBridge] tokens.ts  → ${tsPath}`);
  } else {
    console.warn(`[DesignBridge] tokens.json not found at ${tokensPath} — skipping token files`);
  }

  // Generate component files
  console.log(`[DesignBridge] Generating ${components.length} components → ${outDir}`);
  const names: string[] = [];

  for (const entry of components) {
    const filename = toFilename(entry.name);
    const filepath = path.join(outDir, filename);
    const content = generateComponentFile(entry, valueMap);
    fs.writeFileSync(filepath, content, 'utf8');
    console.log(`  ✓ ${filename}${entry.tokenRefs.length ? ` (${entry.tokenRefs.length} token refs)` : ''}`);

    // Update codeRef
    entry.codeRef = path.relative(path.dirname(manifestPath), filepath);
    names.push(entry.name);
  }

  // Barrel index
  fs.writeFileSync(path.join(outDir, 'index.ts'), generateIndexFile(names), 'utf8');
  console.log(`  ✓ index.ts`);

  // Write updated manifest
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`[DesignBridge] codeRef updated in ${path.basename(manifestPath)}`);
}

main().catch((err) => {
  console.error('[DesignBridge] Error:', err);
  process.exit(1);
});
