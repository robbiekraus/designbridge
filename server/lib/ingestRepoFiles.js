import { ingestCss, normalizeColor, pxNumber, remToPx } from './cssIngest.js';
import { parseTailwindTheme } from './tailwindTheme.js';
import { recognizeRepoInventory } from './repoInventory.js';
import { isTailwindConfig, isCssFile } from './repoFilePatterns.js';
import { buildRepoComposition } from './repoComposition.js';

const dedupeBy = (arr, keyFn) => {
  const seen = new Set();
  return arr.filter((t) => {
    const k = keyFn(t);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

function tailwindTokens(filePath, parsed) {
  const src = (p) => `${filePath} → ${p}`;
  const out = { colors: [], typography: [], spacing: [], radius: [], shadows: [] };
  for (const e of parsed.entries.colors) {
    const hex = normalizeColor(String(e.value));
    if (hex) out.colors.push({ hex, role: e.name, confidence: 'high', source: src(e.path) });
  }
  for (const e of parsed.entries.spacing) {
    const px = pxNumber(String(e.value));
    if (px != null) out.spacing.push({ value: px, usage: e.name, confidence: 'high', source: src(e.path) });
  }
  for (const e of parsed.entries.radius) {
    const v = String(e.value);
    out.radius.push({
      value: v.endsWith('%') ? v : remToPx(v), usage: e.name, confidence: 'high', source: src(e.path),
    });
  }
  for (const e of parsed.entries.shadows) {
    if (e.value !== 'none') {
      out.shadows.push({ description: e.name, css: String(e.value), confidence: 'high', source: src(e.path) });
    }
  }
  for (const e of parsed.entries.fontSize) {
    const px = pxNumber(String(e.value));
    if (px != null) {
      out.typography.push({ size: px, weight: '400', role: e.name, sample: 'Aa', confidence: 'high', source: src(e.path) });
    }
  }
  return out;
}

export function ingestRepoFiles(files, { sourceUrl = null, branch = null } = {}) {
  const warnings = new Set();
  const acc = { colors: [], typography: [], spacing: [], radius: [], shadows: [] };

  // 1. Tailwind zuerst — benannte Theme-Einträge gewinnen beim Dedupe.
  for (const f of files.filter((f) => isTailwindConfig(f.path))) {
    const parsed = parseTailwindTheme(f.content);
    parsed.warnings.forEach((w) => warnings.add(w));
    const t = tailwindTokens(f.path, parsed);
    for (const k of Object.keys(acc)) acc[k].push(...t[k]);
  }

  // 2. CSS-Dateien über den vorhandenen Ingester, Herkunft mit Dateipfad präfixiert.
  for (const f of files.filter((f) => isCssFile(f.path))) {
    const r = ingestCss(f.content);
    const withFile = (tok) => ({ ...tok, source: tok.source ? `${f.path} → ${tok.source}` : f.path });
    acc.colors.push(...r.tokens.colors.map(withFile));
    acc.typography.push(...r.tokens.typography.map(withFile));
    acc.spacing.push(...r.tokens.spacing.map(withFile));
    acc.radius.push(...r.tokens.border_radius.map(withFile));
    acc.shadows.push(...r.tokens.shadows.map(withFile));
    if (r.warnings.some((w) => /niedrige Confidence/.test(w))) {
      warnings.add('Einige Werte stammen aus CSS-Deklarationen (niedrige Confidence) — bitte prüfen.');
    }
  }

  const tokens = {
    colors: dedupeBy(acc.colors, (t) => t.hex),
    typography: dedupeBy(acc.typography, (t) => `${t.size}/${t.weight}`),
    spacing: dedupeBy(acc.spacing, (t) => t.value).sort((a, b) => a.value - b.value),
    border_radius: dedupeBy(acc.radius, (t) => String(t.value)),
    shadows: dedupeBy(acc.shadows, (t) => t.css),
  };

  const inventory = recognizeRepoInventory(files);

  const tokenCount = Object.values(tokens).reduce((n, arr) => n + arr.length, 0);
  if (tokenCount === 0) {
    warnings.add('Keine Design-Tokens gefunden — weder tailwind.config noch CSS-Variablen.');
  }

  // Verschachtelung aus dem echten Code-Graph — dieselbe Pipeline für beide
  // Repo-Routen (/repo und /repo/ai rufen beide ingestRepoFiles zuerst auf).
  const allItems = [...inventory.atoms, ...inventory.organisms, ...inventory.templates];
  const filesByPath = Object.fromEntries(files.map((f) => [f.path, f.content]));
  const composition = buildRepoComposition(allItems, filesByPath);

  return {
    summary: {
      source_description: 'Tokens und Inventar aus Repository extrahiert',
      app_type: 'Code-Repository',
      color_mode: 'unknown',
      design_style: 'aus tailwind.config & CSS abgeleitet',
    },
    tokens,
    atoms: inventory.atoms,
    molecules: [], // Repo-Klassifikator erkennt keine molecules — Bucket bleibt leer (Pinned Contract).
    organisms: inventory.organisms,
    templates: inventory.templates,
    warnings: [...warnings],
    meta: { model: 'repo-ingest', source_url: sourceUrl, branch, ai_deepened: false, elapsed_ms: 0 },
    composition,
  };
}
