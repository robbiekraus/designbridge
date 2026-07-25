import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildRepoCatalog } from './buildRepoCatalog.js';
// Server-seitige Parser im Test verdrahtet (in Prod macht das die Verdrahtung, Schritt 6).
import { parseCva } from '../../../../server/lib/catalog/cvaParser.js';
import { readTheme } from '../../../../server/lib/catalog/themeReader.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dirname, '../../../..');
const buttonSrc = readFileSync(path.join(root, 'server/fixtures/shadcn-repo/components/ui/button.tsx'), 'utf8');
const globals = readFileSync(path.join(root, 'server/fixtures/shadcn-repo/app/globals.css'), 'utf8');

function build() {
  const theme = readTheme(globals);
  const entries = [{ path: 'components/ui/button.tsx', cva: parseCva(buttonSrc), source: buttonSrc }];
  return buildRepoCatalog(entries, theme);
}

describe('buildRepoCatalog (End-to-End über die echten Fixture-Dateien)', () => {
  it('erzeugt einen Button-Eintrag im Default-Katalog-Format', () => {
    const [button] = build();
    expect(button.name).toBe('Button');
    expect(button.import).toEqual({ name: 'Button', from: '@/components/ui/button' });
    expect(button.variants).toEqual({
      variant: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'],
      size: ['default', 'sm', 'lg', 'icon'],
    });
    expect(button.match).toEqual({ tag: 'button', hints: ['button', 'btn', 'cta'] });
    // asChild + disabled aus dem echten Button-Source erkannt.
    expect(button.props).toEqual(['asChild', 'disabled']);
    expect(typeof button.plan).toBe('function');
  });

  it('plan() ohne Auswahl → Default-Variante mit ECHTEN Repo-Farben', () => {
    const [button] = build();
    const plan = button.plan();
    expect(plan.type).toBe('box');
    expect(plan.padding).toEqual([8, 16, 8, 16]);
    expect(plan.radius).toBe(6);
    expect(plan.fill).toEqual({ token: 'primary', hex: '#18181b' });
    expect(plan.children[0]).toMatchObject({
      content: 'Button', fontSize: 14, fontWeight: 500,
      color: { token: 'primary-foreground', hex: '#fafafa' },
    });
  });

  it('plan({variant}) folgt der echten cva-Variante', () => {
    const [button] = build();
    expect(button.plan({ variant: 'secondary' }).fill).toEqual({ token: 'secondary', hex: '#f4f4f5' });
    expect(button.plan({ variant: 'destructive' }).fill).toEqual({ token: 'destructive', hex: '#ef4444' });
    expect(button.plan({ variant: 'outline' }).stroke).toEqual({ token: 'input', hex: '#e4e4e7' });
    expect(button.plan({ variant: 'outline' }).fill).toEqual({ token: 'background', hex: '#ffffff' });
  });

  it('leere/kaputte Eingabe → leerer Katalog, kein Absturz', () => {
    expect(buildRepoCatalog(null)).toEqual([]);
    expect(buildRepoCatalog([])).toEqual([]);
  });
});

describe('buildRepoCatalog — Container-Einträge (Spec 2026-07-25 §Entscheidung 3)', () => {
  it('card.tsx wird Container, button.tsx bleibt Blatt', () => {
    const cat = buildRepoCatalog([
      { path: 'components/ui/card.tsx', cva: { base: 'rounded-lg border', variants: {}, defaultVariants: {} } },
      { path: 'components/ui/button.tsx', cva: { base: 'h-10 px-4', variants: {}, defaultVariants: {} } },
    ]);
    const byName = Object.fromEntries(cat.map((c) => [c.name, c]));
    expect(byName.Card.container).toBe(true);
    expect(byName.Button.container).toBeUndefined();
  });

  it('unbekannt benannte Komponenten bleiben Blatt (dokumentierte Grenze)', () => {
    const [entry] = buildRepoCatalog([
      { path: 'components/ui/fancy-shell.tsx', cva: { base: 'p-4', variants: {}, defaultVariants: {} } },
    ]);
    expect(entry.name).toBe('FancyShell');
    expect(entry.container).toBeUndefined();
  });
});
