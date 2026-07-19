import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ingestFigmaFile } from './ingestFigmaFile.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, '__fixtures__/figma-file.json'), 'utf8')
);

function byName(list, name) {
  return list.find((i) => i.name === name);
}

test('extracts colors from FILL styles (high confidence, Figma-Style source) and skips gradient fills', () => {
  const result = ingestFigmaFile(fixture, { sourceUrl: 'https://figma.com/design/abc/File' });
  const color = result.tokens.colors.find((c) => c.role === 'Primary/500');
  assert.ok(color, 'expected a color for the Primary/500 style');
  assert.equal(color.hex, '#218cf2');
  assert.equal(color.confidence, 'high');
  assert.equal(color.source, 'Figma-Style: Primary/500');
  // Gradient/Hero style has no SOLID fill → must not produce a color entry.
  assert.equal(result.tokens.colors.some((c) => c.role === 'Gradient/Hero'), false);
});

test('extracts typography from TEXT styles', () => {
  const result = ingestFigmaFile(fixture, {});
  const typo = result.tokens.typography.find((t) => t.role === 'Heading/L');
  assert.ok(typo);
  assert.equal(typo.size, 24);
  assert.equal(typo.weight, '700');
  assert.equal(typo.sample, 'Aa');
  assert.equal(typo.confidence, 'high');
  assert.equal(typo.source, 'Figma-Style: Heading/L');
});

test('extracts shadows from EFFECT styles as a CSS string', () => {
  const result = ingestFigmaFile(fixture, {});
  const shadow = result.tokens.shadows.find((s) => s.description === 'Elevation/Card');
  assert.ok(shadow);
  assert.equal(shadow.css, '0px 4px 8px 0px rgba(0,0,0,0.2)');
  assert.equal(shadow.confidence, 'high');
  assert.equal(shadow.source, 'Figma-Style: Elevation/Card');
});

test('extracts border_radius from cornerRadius nodes (low confidence), deduped by value', () => {
  const result = ingestFigmaFile(fixture, {});
  const r12 = result.tokens.border_radius.find((r) => r.value === '12px');
  const r8 = result.tokens.border_radius.find((r) => r.value === '8px');
  assert.ok(r12);
  assert.equal(r12.confidence, 'low');
  assert.equal(r12.usage, 'aus Figma-Knoten');
  assert.match(r12.source, /cornerRadius von Card BG/);
  assert.ok(r8, 'expected one deduped 8px entry from the two checkbox variants');
  const eightPxCount = result.tokens.border_radius.filter((r) => r.value === '8px').length;
  assert.equal(eightPxCount, 1);
});

test('spacing is empty in v1 with an explanatory warning', () => {
  const result = ingestFigmaFile(fixture, {});
  assert.deepEqual(result.tokens.spacing, []);
  assert.ok(result.warnings.some((w) => /Spacing wird aus Figma-Styles nicht gelesen/.test(w)));
});

test('classifies inventory into atoms/molecules/organisms/templates', () => {
  const result = ingestFigmaFile(fixture, {});

  // COMPONENT_SET "Checkbox" → atom, variants = child component names.
  const checkbox = byName(result.atoms, 'Checkbox');
  assert.ok(checkbox, 'expected Checkbox atom from the component set');
  assert.deepEqual(checkbox.variants, ['Checkbox, State=Checked', 'Checkbox, State=Unchecked']);
  assert.equal(checkbox.source, 'figma');

  // Standalone COMPONENT "Button" → atom, no variants.
  const button = byName(result.atoms, 'Button');
  assert.ok(button, 'expected standalone Button atom');
  assert.deepEqual(button.variants, []);

  // COMPONENT "Search Bar" → molecule.
  assert.ok(byName(result.molecules, 'Search Bar'));

  // COMPONENT "Metric Card" → organism (default bucket).
  assert.ok(byName(result.organisms, 'Metric Card'));

  // Top-level FRAME "Header" → shell name → organism, NOT template.
  assert.ok(byName(result.organisms, 'Header'));
  assert.equal(byName(result.templates, 'Header'), undefined);

  // Top-level FRAME "Dashboard Screen" → template (screen-like name).
  assert.ok(byName(result.templates, 'Dashboard Screen'));

  // Checkbox variant children must not leak in as standalone components.
  assert.equal(byName(result.atoms, 'Checkbox, State=Checked'), undefined);
});

test('canonical shape: summary, buckets, warnings, meta', () => {
  const result = ingestFigmaFile(fixture, { sourceUrl: 'https://figma.com/design/abc/File' });
  assert.deepEqual(Object.keys(result).sort(), ['atoms', 'meta', 'molecules', 'organisms', 'summary', 'templates', 'tokens', 'warnings'].sort());
  assert.deepEqual(result.summary, {
    source_description: 'Tokens & Inventar aus Figma',
    app_type: 'Figma-Datei',
    color_mode: 'unknown',
    design_style: 'aus Figma-Styles abgeleitet',
  });
  assert.deepEqual(Object.keys(result.tokens).sort(), ['border_radius', 'colors', 'shadows', 'spacing', 'typography'].sort());
  assert.deepEqual(result.meta, {
    model: 'figma-ingest', source_url: 'https://figma.com/design/abc/File', ai_deepened: false, elapsed_ms: 0,
  });
});

test('without variables → warning that Figma-Variables need Enterprise', () => {
  const result = ingestFigmaFile({ ...fixture, variables: null }, {});
  assert.ok(result.warnings.some((w) => /Figma-Variables benötigen Enterprise/.test(w)));
});

test('with variables → COLOR/FLOAT variables feed colors/border_radius/spacing', () => {
  const variables = {
    'VariableID:1': {
      id: 'VariableID:1', name: 'color/accent', resolvedType: 'COLOR',
      valuesByMode: { m1: { r: 1, g: 0, b: 0, a: 1 } },
    },
    'VariableID:2': {
      id: 'VariableID:2', name: 'radius/lg', resolvedType: 'FLOAT',
      valuesByMode: { m1: 16 },
    },
    'VariableID:3': {
      id: 'VariableID:3', name: 'spacing/md', resolvedType: 'FLOAT',
      valuesByMode: { m1: 24 },
    },
  };
  const result = ingestFigmaFile({ ...fixture, variables }, {});

  const accent = result.tokens.colors.find((c) => c.role === 'color/accent' || c.hex === '#ff0000');
  assert.ok(accent);
  assert.equal(accent.hex, '#ff0000');
  assert.equal(accent.confidence, 'high');
  assert.equal(accent.source, 'Figma-Variable: color/accent');

  const radius = result.tokens.border_radius.find((r) => r.usage === 'radius/lg');
  assert.ok(radius);
  assert.equal(radius.value, '16px');
  assert.equal(radius.confidence, 'high');
  assert.equal(radius.source, 'Figma-Variable: radius/lg');

  const spacing = result.tokens.spacing.find((s) => s.usage === 'spacing/md');
  assert.ok(spacing);
  assert.equal(spacing.value, 24);
  assert.equal(spacing.confidence, 'high');
  assert.equal(spacing.source, 'Figma-Variable: spacing/md');

  // No Enterprise-needed warning once variables are actually present.
  assert.equal(result.warnings.some((w) => /Figma-Variables benötigen Enterprise/.test(w)), false);
});
