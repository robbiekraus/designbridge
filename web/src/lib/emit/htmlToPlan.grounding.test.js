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
});
