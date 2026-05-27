#!/usr/bin/env node
/**
 * sync-exports.js
 *
 * Finds the most recently modified *-tokens.json and *-components.manifest.json
 * in ../exports/, runs codegen, and syncs to the dashboard.
 *
 * Usage: npm run export
 *   Optional: npm run export -- --project midori
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const EXPORTS_DIR = path.join(__dirname, '..', '..', 'exports');
const DASHBOARD_DATA = path.join(__dirname, '..', '..', 'designbridge-web', 'public', 'data');

// ─── Parse optional --project flag ────────────────────────────────────────────

const args = process.argv.slice(2);
const projectIdx = args.indexOf('--project');
const projectFlag = projectIdx !== -1 ? args[projectIdx + 1] : null;

// ─── Find latest export files ─────────────────────────────────────────────────

function findLatestFile(suffix) {
  const files = fs.readdirSync(EXPORTS_DIR)
    .filter(f => f.endsWith(suffix))
    .map(f => ({
      name: f,
      fullPath: path.join(EXPORTS_DIR, f),
      mtime: fs.statSync(path.join(EXPORTS_DIR, f)).mtimeMs,
    }));

  if (files.length === 0) return null;

  if (projectFlag) {
    const match = files.find(f => f.name.startsWith(projectFlag + '-'));
    if (match) return match;
    console.warn(`⚠️  No file found for project "${projectFlag}", using latest.`);
  }

  return files.sort((a, b) => b.mtime - a.mtime)[0];
}

const tokensFile = findLatestFile('-tokens.json');
const manifestFile = findLatestFile('-components.manifest.json');

if (!tokensFile || !manifestFile) {
  console.error('❌ No export files found in', EXPORTS_DIR);
  console.error('   Export from the Figma plugin first.');
  process.exit(1);
}

const project = tokensFile.name.replace(/-tokens\.json$/, '');
console.log(`\n📦 Project: ${project}`);
console.log(`   tokens   → ${tokensFile.name} (${new Date(tokensFile.mtime).toLocaleTimeString()})`);
console.log(`   manifest → ${manifestFile.name} (${new Date(manifestFile.mtime).toLocaleTimeString()})\n`);

// ─── Run codegen ──────────────────────────────────────────────────────────────

const distCodegen = path.join(__dirname, '..', 'dist', 'codegen.js');
const outDir = path.join(EXPORTS_DIR, project, 'components');

execSync(
  `node "${distCodegen}" --manifest "${manifestFile.fullPath}" --out "${outDir}"`,
  { stdio: 'inherit' }
);

// ─── Sync to dashboard ────────────────────────────────────────────────────────

fs.mkdirSync(DASHBOARD_DATA, { recursive: true });
fs.copyFileSync(tokensFile.fullPath, path.join(DASHBOARD_DATA, 'tokens.json'));
fs.copyFileSync(manifestFile.fullPath, path.join(DASHBOARD_DATA, 'components.manifest.json'));

console.log('\n✓ Dashboard synced:');
console.log(`   → designbridge-web/public/data/tokens.json`);
console.log(`   → designbridge-web/public/data/components.manifest.json`);
console.log('\n✓ Codegen + Dashboard sync done.');
