// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
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

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(HERE, '../../..');                       // …/web
const TARGET = path.resolve(WEB_ROOT, 'verification/shadcn-target');    // …/web/verification/shadcn-target

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

    // In ein tmp-Verzeichnis UNTER web/ schreiben, damit react/react-dom aus web/node_modules auflösen.
    const tmp = fs.mkdtempSync(path.join(WEB_ROOT, '.verify-'));
    try {
      fs.writeFileSync(path.join(tmp, 'LoginForm.jsx'), code);
      // Entry rendert selbst (react + react-dom werden mitgebündelt wie in einem echten Build) und
      // exportiert das Markup — hermetisch, keine cross-Instanz-/vite-resolve-Effekte.
      fs.writeFileSync(path.join(tmp, 'entry.jsx'),
        "import React from 'react';\n" +
        "import { renderToStaticMarkup } from 'react-dom/server';\n" +
        "import { LoginForm } from './LoginForm.jsx';\n" +
        "export const html = renderToStaticMarkup(React.createElement(LoginForm));\n");
      const outfile = path.join(tmp, 'bundle.cjs');

      // KOMPILIER-BEWEIS: gelingt das Bundle, sind alle @/-Imports auflösbar und das JSX gültig.
      await esbuild.build({
        entryPoints: [path.join(tmp, 'entry.jsx')],
        outfile, bundle: true, format: 'cjs', platform: 'node', jsx: 'automatic',
        alias: { '@': TARGET },
        logLevel: 'silent',
      });

      // RENDER-BEWEIS: die Komponente rendert ohne Wurf und enthält die echten Inhalte + Varianten.
      const rendered = createRequire(import.meta.url)(outfile).html;
      expect(rendered).toContain('Anmelden');
      expect(rendered).toContain('Abbrechen');
      expect(rendered).toContain('<button');   // Button-Stub → <button>
      expect(rendered).toContain('<input');     // Input-Stub → <input>
      expect(rendered).toContain('<label');     // Label-Stub → <label>
      expect(rendered).toContain('bg-secondary'); // secondary-Variante hat gegriffen
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      await esbuild.stop(); // esbuild-Service beenden (sonst hängen Worker-Threads beim Teardown)
    }
  }, 30000);
});
