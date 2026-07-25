// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import esbuild from 'esbuild';
import { htmlToPlan } from './htmlToPlan.js';
import { planToJsx } from './planToJsx.js';
import { SHADCN_DEFAULT_CATALOG_OPTION } from '../catalog/shadcn-default.js';

// DS-Grounding, Scheibe 1 Schritt 6 — der eigentliche Beweis: emittierter Code kompiliert gegen ein
// reales, API-kompatibles shadcn-Target (esbuild löst @/ auf) UND rendert ohne Fehler (react-dom).
// Das ist der bislang ungecheckte Dev-Empfang, jetzt als dauerhafter Regressionswächter.
//
// Läuft im NODE-Environment (nicht jsdom): esbuild braucht ein natives TextEncoder, das die
// jsdom-Vitest-Umgebung global ersetzt. htmlToPlan braucht dagegen ein DOM — deshalb wird jsdom hier
// MANUELL als Bibliothek instanziiert (das lässt globales TextEncoder unangetastet).

beforeAll(() => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  globalThis.document = dom.window.document;
  globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  globalThis.window = dom.window;
});

// esbuild startet seinen (impliziten) Node-Service lazy beim ersten build() und hält ihn zwischen
// Aufrufen offen — hier EINMAL für die ganze Suite am Ende gestoppt (statt pro Testfall), damit
// mehrere Testfälle denselben Service teilen können, ohne dass Worker-Threads beim Teardown hängen.
afterAll(async () => {
  await esbuild.stop();
});

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(HERE, '../../..');                       // …/web
const TARGET = path.resolve(WEB_ROOT, 'verification/shadcn-target');    // …/web/verification/shadcn-target

/** Emittierten Code in ein tmp-Verzeichnis UNTER web/ schreiben (react/react-dom lösen so aus
 *  web/node_modules auf), gegen das echte shadcn-Target bündeln (esbuild löst @/ auf) und
 *  serverseitig rendern. Gibt sowohl den gerenderten HTML-String als auch ein per JSDOM daraus
 *  geparstes Root-Element zurück, damit Testfälle die Baumstruktur (Verschachtelung, einzelne
 *  Text-Knoten) prüfen können, nicht nur den rohen String. */
async function compileAndRender(code, componentName) {
  const tmp = fs.mkdtempSync(path.join(WEB_ROOT, '.verify-'));
  try {
    fs.writeFileSync(path.join(tmp, `${componentName}.jsx`), code);
    // Entry rendert selbst (react + react-dom werden mitgebündelt wie in einem echten Build) und
    // exportiert das Markup — hermetisch, keine cross-Instanz-/vite-resolve-Effekte.
    fs.writeFileSync(path.join(tmp, 'entry.jsx'),
      "import React from 'react';\n" +
      "import { renderToStaticMarkup } from 'react-dom/server';\n" +
      `import { ${componentName} } from './${componentName}.jsx';\n` +
      `export const html = renderToStaticMarkup(React.createElement(${componentName}));\n`);
    const outfile = path.join(tmp, 'bundle.cjs');

    // KOMPILIER-BEWEIS: gelingt das Bundle, sind alle @/-Imports auflösbar und das JSX gültig.
    await esbuild.build({
      entryPoints: [path.join(tmp, 'entry.jsx')],
      outfile, bundle: true, format: 'cjs', platform: 'node', jsx: 'automatic',
      alias: { '@': TARGET },
      logLevel: 'silent',
    });

    // RENDER-BEWEIS: die Komponente rendert ohne Wurf.
    const html = createRequire(import.meta.url)(outfile).html;
    const root = new JSDOM(html).window.document.body;
    return { html, root };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

describe('DS-Grounding — Verifikation gegen reales shadcn-Target', () => {
  it('generierter Code kompiliert (esbuild, @/-Import) und rendert (react-dom)', async () => {
    const html = `<div style="display:flex;flex-direction:column;gap:12px;padding:24px">
      <label data-ds-component="Label" style="font-size:14px">E-Mail</label>
      <input data-ds-component="Input" style="padding:8px 12px" />
      <button data-ds-component="Button" data-ds-variant="default" data-ds-size="default" style="padding:8px 16px">Anmelden</button>
      <button data-ds-component="Button" data-ds-variant="secondary" data-ds-size="sm" style="padding:6px 12px">Abbrechen</button>
    </div>`;
    const { plan } = htmlToPlan(html, { catalog: SHADCN_DEFAULT_CATALOG_OPTION });
    const code = planToJsx(plan, { name: 'LoginForm' });

    // Emit trägt echte shadcn-Imports + Komponenten (Button 2× → 1 Import).
    expect(code).toContain('import { Button } from "@/components/ui/button";');
    expect(code).toContain('import { Input } from "@/components/ui/input";');
    expect(code).toContain('import { Label } from "@/components/ui/label";');
    expect((code.match(/from "@\/components\/ui\/button"/g) || []).length).toBe(1);
    expect(code).toContain('<Button variant="secondary" size="sm">Abbrechen</Button>');

    // RENDER-BEWEIS: die Komponente rendert ohne Wurf und enthält die echten Inhalte + Varianten.
    const { html: rendered } = await compileAndRender(code, 'LoginForm');
    expect(rendered).toContain('Anmelden');
    expect(rendered).toContain('Abbrechen');
    expect(rendered).toContain('<button');   // Button-Stub → <button>
    expect(rendered).toContain('<input');     // Input-Stub → <input>
    expect(rendered).toContain('<label');     // Label-Stub → <label>
    expect(rendered).toContain('bg-secondary'); // secondary-Variante hat gegriffen
  }, 30000);

  it('gegroundete Card mit verschachtelten Kindern (KPI-Karte) rendert VERSCHACHTELT, nicht als Textklumpen', async () => {
    // Leitfall der Spec (2026-07-25-komposition-gegroundeter-bausteine-design.md §Verifikation Punkt 2):
    // eine Card mit drei Text-Kindern, davon eines ein verschachtelter Badge-Ref — muss als echter
    // Component-Baum rendern (Card trägt Kinder), nicht zu einer Textzeile eingeschmolzen werden.
    const html = `<div data-ds-component="Card" style="display:flex;flex-direction:column;gap:8px;padding:20px;background:#ffffff;border:1px solid #e4e4e7;border-radius:16px">
      <span style="font-size:14px;color:#71717a">Orders</span>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:28px;font-weight:700">13.465</span>
        <span data-ds-component="Badge" data-ds-variant="secondary" style="padding:2px 8px;font-size:12px">3.1%</span>
      </div>
      <span style="font-size:12px">Last month: 11.246</span>
    </div>`;
    const { plan } = htmlToPlan(html, { catalog: SHADCN_DEFAULT_CATALOG_OPTION });
    const code = planToJsx(plan, { name: 'KpiCard' });

    // Nur EIN Card- und EIN Badge-Import (nicht je Vorkommen).
    expect((code.match(/from "@\/components\/ui\/card"/g) || []).length).toBe(1);
    expect((code.match(/from "@\/components\/ui\/badge"/g) || []).length).toBe(1);
    expect(code).toContain('import { Badge } from "@/components/ui/badge";');
    expect(code).toContain('import { Card } from "@/components/ui/card";');
    // Card ist komponiert (öffnendes + schließendes Tag), nicht self-closing eingeschmolzen.
    expect(code).toMatch(/<Card[^>]*>[\s\S]*<\/Card>/);
    expect(code).toContain('<Badge variant="secondary">3.1%</Badge>');

    const { root } = await compileAndRender(code, 'KpiCard');

    // VERSCHACHTELUNG: ein Element mit den echten shadcn-Card-Klassen (Target-Stub setzt
    // `rounded-lg border bg-card …`), das mehrere Kind-Elemente trägt statt eines Textklumpens.
    const cardEl = root.querySelector('.rounded-lg.border.bg-card');
    expect(cardEl).not.toBeNull();
    expect(cardEl.children.length).toBeGreaterThan(1);

    // Die drei Textstücke liegen in UNTERSCHIEDLICHEN Elementen — kein Blatt trägt alle drei
    // gemeinsam als eigenen Textinhalt (das wäre der eingeschmolzene Textklumpen).
    const leafTexts = [...root.querySelectorAll('*')]
      .filter((el) => el.children.length === 0)
      .map((el) => el.textContent.trim());
    expect(leafTexts).toContain('Orders');
    expect(leafTexts).toContain('13.465');
    expect(leafTexts).toContain('Last month: 11.246');
    expect(leafTexts.filter((t) => t.includes('Orders') && t.includes('13.465') && t.includes('Last month'))).toHaveLength(0);

    // Badge ist eine echte gerenderte Badge-Komponente (Stub-Klasse `rounded-full`), Text „3.1%".
    const badgeEl = root.querySelector('.rounded-full');
    expect(badgeEl).not.toBeNull();
    expect(badgeEl.tagName).toBe('SPAN');
    expect(badgeEl.textContent.trim()).toBe('3.1%');
  }, 30000);
});
