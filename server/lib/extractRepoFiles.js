import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as tar from 'tar';
import {
  shouldSkipPath, isTailwindConfig, isCssFile,
  isUiComponent, isComponentFile, isPageFile, isLayoutFile,
} from './repoFilePatterns.js';

const CAPS = {
  tailwind: 3, css: 20, ui: 100, other: 50, total: 150,
  cssBytes: 200 * 1024, uiBytes: 8 * 1024, maxDepth: 8,
};

export async function extractRepoFiles(tarballBuffer, caps = CAPS) {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'designbridge-repo-'));
  try {
    await new Promise((resolve, reject) => {
      // strip:1 entfernt den "repo-sha/"-Wurzelordner des GitHub-Tarballs.
      // filter: SKIP_DIRS und AppleDouble landen gar nicht erst auf der Platte.
      // node-tar neutralisiert ".."-/absolute Pfade selbst (Zip-Slip-Schutz).
      const unpack = tar.x({ cwd: tmp, strip: 1, filter: (p) => !shouldSkipPath(p) });
      unpack.on('close', resolve);
      unpack.on('error', reject);
      unpack.end(tarballBuffer);
    });
    return await selectRepoFiles(tmp, caps);
  } finally {
    await rm(tmp, { recursive: true, force: true }); // auch im Fehlerfall
  }
}

export async function selectRepoFiles(rootDir, caps = CAPS) {
  const paths = [];
  async function walk(dir, rel, depth) {
    if (depth > caps.maxDepth) return;
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('._')) continue;
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (shouldSkipPath(relPath)) continue;
      if (entry.isDirectory()) await walk(path.join(dir, entry.name), relPath, depth + 1);
      else if (entry.isFile()) paths.push(relPath);
    }
  }
  await walk(rootDir, '', 0);
  // flachere Pfade zuerst — bei Kappung gewinnen Wurzel-Dateien
  paths.sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));

  const files = [];
  const counts = { tailwind: 0, css: 0, ui: 0, other: 0 };
  const read = async (p, cap) => (await readFile(path.join(rootDir, p), 'utf8')).slice(0, cap);

  for (const p of paths) {
    if (files.length >= caps.total) break;
    if (isTailwindConfig(p) && counts.tailwind < caps.tailwind) {
      files.push({ path: p, content: await read(p, caps.cssBytes) });
      counts.tailwind++;
    } else if (isCssFile(p) && counts.css < caps.css) {
      files.push({ path: p, content: await read(p, caps.cssBytes) });
      counts.css++;
    } else if (isUiComponent(p) && counts.ui < caps.ui) {
      files.push({ path: p, content: await read(p, caps.uiBytes) });
      counts.ui++;
    } else if ((isComponentFile(p) || isPageFile(p) || isLayoutFile(p)) && counts.other < caps.other) {
      files.push({ path: p, content: '' }); // nur der Pfad zählt
      counts.other++;
    }
  }
  return files;
}
