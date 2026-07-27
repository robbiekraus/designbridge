import { describe, it, expect } from 'vitest';
import { htmlToPlan } from './htmlToPlan.js';
import { planToJsx } from './planToJsx.js';
import { SHADCN_DEFAULT_CATALOG } from '../catalog/shadcn-default.js';

// DS-Grounding, Scheibe 1 Schritt 2 (Spec 2026-07-23-slice1-ds-grounding-default-catalog-design.md §Q2):
// data-ds-component-Markierungen im Interpretations-HTML werden zu Katalog-component-refs promotet.
//
// Hinweis: htmlToPlan verpackt einen Nicht-Box-Wurzelknoten laut Vertrag in eine Box (PlanBox|null am
// Root). Ein Wurzel-component-ref liegt daher als plan.children[0] — Tests suchen den Ref per findNode.

const CATALOG = { source: 'shadcn-default', components: SHADCN_DEFAULT_CATALOG };

// Ersten Knoten im Baum finden, der prädikat erfüllt (Tiefensuche inkl. fallback).
function findNode(node, pred) {
  if (!node || typeof node !== 'object') return null;
  if (pred(node)) return node;
  for (const child of node.children || []) {
    const hit = findNode(child, pred);
    if (hit) return hit;
  }
  if (node.fallback) return findNode(node.fallback, pred);
  return null;
}

const findCatalogRef = (plan) => findNode(plan, (n) => n.type === 'component-ref' && n.catalog);
const findText = (node, content) => findNode(node, (n) => n.type === 'text' && n.content === content);

describe('htmlToPlan — DS-Grounding gegen den Katalog', () => {
  it('markierter Button → Katalog-component-ref mit Identität, validierten Props und Import', () => {
    const html = '<button data-ds-component="Button" data-ds-variant="secondary" data-ds-size="sm" style="background:#f4f4f5;color:#18181b;padding:6px 12px">Speichern</button>';
    const ref = findCatalogRef(htmlToPlan(html, { catalog: CATALOG }).plan);
    expect(ref).toBeTruthy();
    expect(ref.name).toBe('Button');
    expect(ref.catalog).toBe('shadcn-default');
    expect(ref.variant).toBe('secondary');
    expect(ref.props).toEqual({ variant: 'secondary', size: 'sm' });
    expect(ref.import).toEqual({ name: 'Button', from: '@/components/ui/button' });
  });

  // Live-Fund 27.07. (EcoMetrics-Scan „Plant Item Row", ganze Kette htmlToPlan → planToJsx): ein
  // gegroundeter Avatar-Fallback-Buchstabe verlor beim Grounding jede Stilinfo, weil
  // `matchCatalogComponent` das Katalog-Flag zwar auslas, der component-ref-Knoten in htmlToPlan()
  // es aber NICHT in den plan übernahm (nur voidElement/container/slots wurden kopiert) — der Wert
  // ging also schon vor planToJsx.js verloren. Dieser Test deckt die GANZE Kette ab, nicht nur den
  // isolierten planToJsx-Baustein (der die Weitergabe stillschweigend voraussetzt).
  it('Katalog-Flag styledFallbackText reist bis zum component-ref-Knoten UND bis ins fertige JSX (Avatar: End-to-End)', () => {
    const html = '<div data-ds-component="Avatar" style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#fcf6bd,#e3d55c);color:#5352ed;font-weight:700;font-size:18px;display:flex;align-items:center;justify-content:center">B</div>';
    const { plan } = htmlToPlan(html, { catalog: CATALOG });
    const ref = findCatalogRef(plan);
    expect(ref.styledFallbackText).toBe(true);
    const code = planToJsx(plan, { name: 'PlantItemRow' });
    expect(code).toContain('<Avatar className="flex items-center justify-center text-[18px] font-bold text-[#5352ed]">B</Avatar>');
  });

  it('Katalog-Einträge OHNE das Flag (z. B. Button) tragen styledFallbackText:false am Ref', () => {
    const html = '<button data-ds-component="Button" style="padding:8px">Speichern</button>';
    const ref = findCatalogRef(htmlToPlan(html, { catalog: CATALOG }).plan);
    expect(ref.styledFallbackText).toBe(false);
  });

  it('Container-Katalog-Einträge tragen container:true am Ref, Blätter nicht', () => {
    // Spec 2026-07-25-komposition-gegroundeter-bausteine-design.md §Entscheidung 3: Card darf den
    // interpretierten Unterbaum tragen, Button bleibt Label-Träger.
    const card = '<div data-ds-component="Card" style="padding:20px"><span style="font-size:14px">Orders</span></div>';
    expect(findCatalogRef(htmlToPlan(card, { catalog: CATALOG }).plan).container).toBe(true);
    const button = '<button data-ds-component="Button" style="padding:8px">Speichern</button>';
    expect(findCatalogRef(htmlToPlan(button, { catalog: CATALOG }).plan).container).toBe(false);
  });

  it('der inline-gestylte Subtree bleibt als fallback erhalten (Text sichtbar)', () => {
    const html = '<button data-ds-component="Button" style="padding:8px">Speichern</button>';
    const ref = findCatalogRef(htmlToPlan(html, { catalog: CATALOG }).plan);
    expect(ref.fallback?.type).toBe('box');
    expect(findText(ref.fallback, 'Speichern')).toBeTruthy();
  });

  it('OHNE catalog-Option: identisches HTML wird KEIN Katalog-ref (Opt-in, Null-Regression)', () => {
    const html = '<button data-ds-component="Button" data-ds-variant="secondary" style="padding:8px">Speichern</button>';
    const { plan } = htmlToPlan(html);
    expect(findCatalogRef(plan)).toBeNull();
  });

  it('explizite Markierung hat VORRANG vor der Klassen-Heuristik', () => {
    // <button> würde per Heuristik als "Button" gelten — die Markierung zwingt "Badge".
    const html = '<button data-ds-component="Badge" data-ds-variant="destructive" style="padding:2px 10px">Neu</button>';
    const ref = findCatalogRef(htmlToPlan(html, { catalog: CATALOG }).plan);
    expect(ref.name).toBe('Badge');
    expect(ref.catalog).toBe('shadcn-default');
    expect(ref.props).toEqual({ variant: 'destructive' });
  });

  it('unbekannter Katalog-Name → Warnung + freihändiger Fallback (kein ref, kein Zwang)', () => {
    const html = '<div data-ds-component="Nichtvorhanden" style="padding:8px">x</div>';
    const { plan, warnings } = htmlToPlan(html, { catalog: CATALOG });
    expect(findCatalogRef(plan)).toBeNull();
    expect(warnings.some((w) => w.includes('Nichtvorhanden'))).toBe(true);
  });

  it('ungültige Varianten-Option → Warnung, Option verworfen, ref bleibt bestehen', () => {
    const html = '<button data-ds-component="Button" data-ds-variant="knallpink" style="padding:8px">x</button>';
    const { plan, warnings } = htmlToPlan(html, { catalog: CATALOG });
    const ref = findCatalogRef(plan);
    expect(ref.name).toBe('Button');
    expect(ref.props.variant).toBeUndefined();
    expect(ref.variant).toBeNull();
    expect(warnings.some((w) => w.includes('knallpink'))).toBe(true);
  });

  it('verschachtelt: Katalog-ref als Kind eines normalen Containers', () => {
    const html = '<div style="display:flex;padding:16px"><button data-ds-component="Button" style="padding:8px">OK</button></div>';
    const { plan } = htmlToPlan(html, { catalog: CATALOG });
    expect(plan.type).toBe('box');
    expect(findCatalogRef(plan)?.name).toBe('Button');
  });

  it('Durchstich HTML → plan → JSX: markierter Button ergibt echten shadcn-Code', () => {
    const html = '<button data-ds-component="Button" data-ds-variant="secondary" data-ds-size="sm" style="padding:6px 12px">Speichern</button>';
    const { plan } = htmlToPlan(html, { catalog: CATALOG });
    const code = planToJsx(plan, { name: 'SaveButton' });
    expect(code).toContain('import { Button } from "@/components/ui/button";');
    expect(code).toContain('<Button variant="secondary" size="sm">Speichern</Button>');
    expect(code).toContain('export function SaveButton(');
  });

  it('markiertes Input trägt voidElement (Katalog-Eintrag rendert ein natives <input>)', () => {
    const html = '<div data-ds-component="Input" style="padding:8px">Suchen…</div>';
    const ref = findCatalogRef(htmlToPlan(html, { catalog: CATALOG }).plan);
    expect(ref.name).toBe('Input');
    expect(ref.voidElement).toBe(true);
  });

  it('Durchstich HTML → plan → JSX: Input mit sichtbarem Platzhaltertext im Fallback rendert TROTZDEM selbstschließend (Live-Fund 24.07.: echter Prod-Scan legte Text ins Input-HTML, <Input>Text</Input> crasht React — void element)', () => {
    const html = '<div data-ds-component="Input" style="display:flex;padding:12px 16px">Suchen…</div>';
    const { plan } = htmlToPlan(html, { catalog: CATALOG });
    const code = planToJsx(plan, { name: 'SearchBar' });
    expect(code).toContain('<Input />');
    expect(code).not.toContain('<Input>');
  });

  // Live-Fund 27.07. abends (Robs EcoMetrics-Scan „Sidebar Navigation", Storage/Upgrade-Widget):
  // eine dunkel gefüllte Card (rgba(0,0,0,0.18), Overlay für weißen Text auf lila Sidebar-Grund)
  // wurde als data-ds-component="Card" gegroundet — die Katalog-Hülle ersetzt fill/stroke/radius
  // IMMER durch den (hellen) Default (shadcn `bg-card` = weiß, s. Tests oben in
  // groundPlan.test.js/planToJsx.grounding.test.js: das ist ein bewusster, getesteter Vertrag,
  // keine Lücke). Der unveränderte weiße Kinder-Text wurde dadurch auf hellem Grund unlesbar
  // (Robs Befund: „komplett leeres weißes Rechteck", kein Storage/Upgrade/3.4 GB/Fortschrittsbalken
  // sichtbar). Der Legibility-Guard (containerHullWouldClash) lehnt genau diesen Match ab, BEVOR
  // ein component-ref entsteht — der Baustein fällt auf den normalen, unveränderten Box-Nachbau
  // zurück (identisch zum selben, noch unmarkierten Widget im früheren Scan desselben Tages,
  // Testdaten/ecometrics-scan-27-07-nachmittag.json, das korrekt rendert).
  //
  // Update 28.07. (Robs EcoMetrics-Scan, Testdaten/ecometrics-scan-27-07-final-test.json):
  // derselbe Fallback-Box-Nachbau fror die 18%-deckende Füllung bislang selbst wieder OPAK ein
  // (readFill vor dem FAINT_FILL_ALPHA_MAX-Fix: `bg-[#000000]`, ein lauter schwarzer Kasten statt
  // der fast unsichtbaren Tönung) — ein Rest des URSPRÜNGLICHEN Alpha-Verwurf-Bugs (s. readFill-
  // Kommentar in htmlToPlan.js), nur diesmal im FALLBACK statt im Katalog-Grounding sichtbar. Mit
  // dem Fix bleibt die Füllung ganz weg (transparent) statt falsch-opak — Text bleibt in JEDEM Fall
  // lesbar, hier UND auf echtem lila Sidebar-Grund (Reports-Zeile/Storage-Panel im vollen Scan).
  it('dunkel gefüllte Card mit hellem Katalog-Default (bg-card=weiß) wird NICHT gegroundet — Text bleibt lesbar statt weiß-auf-weiß zu verschwinden', () => {
    const html = '<div data-ds-component="Card" style="background:rgba(0,0,0,0.18);border-radius:10px;padding:10px">'
      + '<span style="font-size:11px;font-weight:700;color:#ffffff;">Storage</span>'
      + '<span style="font-size:9px;color:rgba(255,255,255,0.7);">Upgrade</span>'
      + '</div>';
    const { plan, warnings } = htmlToPlan(html, { catalog: CATALOG });
    expect(findCatalogRef(plan)).toBeNull();
    expect(findText(plan, 'Storage')).toBeTruthy();
    expect(findText(plan, 'Upgrade')).toBeTruthy();
    expect(warnings.some((w) => w.includes('unlesbare Katalog-Hülle'))).toBe(true);
    const code = planToJsx(plan, { name: 'StorageWidget' });
    expect(code).not.toContain('<Card');
    expect(code).not.toMatch(/bg-\[#000000\]/);
  });

  // Gegenprobe: eine HELL gefüllte Card (typischer Dashboard-Fall, wie in den bestehenden
  // groundPlan/planToJsx-Tests) darf vom Guard nicht betroffen sein — der Katalog-Vertrag „Hülle
  // kommt immer aus dem Katalog" bleibt für den Normalfall unangetastet.
  it('hell gefüllte Card bleibt vom Legibility-Guard unberührt — wird ganz normal gegroundet', () => {
    const html = '<div data-ds-component="Card" style="background:#ffffff;padding:20px"><span style="font-size:14px;color:#111827">Orders</span></div>';
    const { plan } = htmlToPlan(html, { catalog: CATALOG });
    const ref = findCatalogRef(plan);
    expect(ref).toBeTruthy();
    expect(ref.name).toBe('Card');
    expect(ref.container).toBe(true);
  });
});
