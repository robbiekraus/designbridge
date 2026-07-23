// Demo/Beweis-Skript (Scheibe 1 Schritt 6): führt die echte Grounding-Pipeline
// (htmlToPlan → planToJsx) über jsdom aus und druckt den emittierten shadcn-Code.
// Aufruf:  node web/verification/generate-sample.mjs
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.document = dom.window.document;
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.window = dom.window;

const { htmlToPlan } = await import('../src/lib/emit/htmlToPlan.js');
const { planToJsx } = await import('../src/lib/emit/planToJsx.js');
const { SHADCN_DEFAULT_CATALOG_OPTION } = await import('../src/lib/catalog/shadcn-default.js');

// Simuliert eine Interpretation, wie sie das Modell mit dem neuen Prompt liefert:
// echte Bausteine sind mit data-ds-* markiert, der Container bleibt Freihand.
const html = `<div style="display:flex;flex-direction:column;gap:12px;padding:24px;background:#ffffff;border:1px solid #e4e4e7;border-radius:8px">
  <label data-ds-component="Label" style="font-size:14px;font-weight:500;color:#09090b">E-Mail</label>
  <input data-ds-component="Input" style="padding:8px 12px;border:1px solid #e4e4e7;border-radius:6px" />
  <button data-ds-component="Button" data-ds-variant="default" data-ds-size="default" style="background:#18181b;color:#fafafa;padding:8px 16px;border-radius:6px">Anmelden</button>
  <button data-ds-component="Button" data-ds-variant="secondary" data-ds-size="sm" style="background:#f4f4f5;color:#18181b;padding:6px 12px;border-radius:6px">Abbrechen</button>
</div>`;

const { plan, warnings } = htmlToPlan(html, { catalog: SHADCN_DEFAULT_CATALOG_OPTION });
console.log(planToJsx(plan, { name: 'LoginForm' }));
if (warnings.length) console.log('\n// Warnungen:', warnings);
