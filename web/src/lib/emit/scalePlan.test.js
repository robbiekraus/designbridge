import { describe, it, expect } from 'vitest';
import { scalePlan, scanScaleFactor } from './scalePlan.js';

function box(o = {}) {
  return { type: 'box', layout: 'row', padding: [0, 0, 0, 0], radius: 0, fill: null, stroke: null,
    strokeWeight: 1, gap: 0, width: null, height: null, primaryAlign: 'MIN', counterAlign: 'MIN', children: [], ...o };
}
function text(o = {}) {
  return { type: 'text', content: 'x', fontSize: 16, fontWeight: 400, color: { hex: '#000', token: null }, align: 'left', lineHeight: null, ...o };
}

// Spec 2026-07-26-einheitlicher-massstab-design.md: der Faktor kommt NICHT mehr pro Baustein aus
// slot/naturalWidth (das erzeugte unvergleichbare Maßstäbe — gemessen 11 bis 49 für vergleichbare
// Texte), sondern EINMAL pro Scan aus Bildbreite/Referenzbreite.
describe('scanScaleFactor', () => {
  it('imageWidth/referenceWidth', () => {
    expect(scanScaleFactor(2048, 1024)).toBe(2);
    expect(scanScaleFactor(2296, 1024)).toBeCloseTo(2.242, 3); // echter CRAFTUI-Scan
    expect(scanScaleFactor(512, 1024)).toBe(0.5);
  });

  it('fehlende/unsinnige Bildbreite → 1 (unverändertes Verhalten statt Raten)', () => {
    // URL-/Repo-Importe setzen raw.meta.image_width nicht — dort darf nichts skaliert werden.
    expect(scanScaleFactor(undefined, 1024)).toBe(1);
    expect(scanScaleFactor(null, 1024)).toBe(1);
    expect(scanScaleFactor(0, 1024)).toBe(1);
    expect(scanScaleFactor(-2000, 1024)).toBe(1);
    expect(scanScaleFactor(NaN, 1024)).toBe(1);
  });

  it('unsinnige Referenzbreite → 1', () => {
    expect(scanScaleFactor(2000, 0)).toBe(1);
    expect(scanScaleFactor(2000, undefined)).toBe(1);
  });
});

describe('scalePlan', () => {
  it('factor 1 / ungültig → unveränderter Plan', () => {
    const p = box({ width: 100 });
    expect(scalePlan(p, 1)).toBe(p);
    expect(scalePlan(p, 0)).toBe(p);
    expect(scalePlan(p, NaN)).toBe(p);
  });

  it('box: width/height/padding/gap/radius/strokeWeight/absolute skaliert; null bleibt null', () => {
    const p = box({ width: 100, height: null, padding: [4, 8, 4, 8], gap: 10, radius: 6,
      stroke: { hex: '#000', token: null }, strokeWeight: 1, absolute: { x: -5, y: 20, width: 100, height: 50 } });
    const r = scalePlan(p, 2);
    expect(r.width).toBe(200);
    expect(r.height).toBeNull();
    expect(r.padding).toEqual([8, 16, 8, 16]);
    expect(r.gap).toBe(20);
    expect(r.radius).toBe(12);
    expect(r.strokeWeight).toBe(2);
    expect(r.absolute).toEqual({ x: -10, y: 40, width: 200, height: 100 });
    expect(p.width).toBe(100); // Original unangetastet (rein)
  });

  it('strokeWeight-Floor 1 beim Runterskalieren', () => {
    const r = scalePlan(box({ stroke: { hex: '#000', token: null }, strokeWeight: 1 }), 0.4);
    expect(r.strokeWeight).toBe(1);
  });

  it('text: fontSize/lineHeight skaliert, null lineHeight bleibt null, Rest unverändert', () => {
    const r = scalePlan(text({ fontSize: 16, lineHeight: 24, fontWeight: 700, content: 'Hi' }), 2);
    expect(r.fontSize).toBe(32);
    expect(r.lineHeight).toBe(48);
    expect(r.fontWeight).toBe(700);
    expect(r.content).toBe('Hi');
    expect(scalePlan(text({ fontSize: 10, lineHeight: null }), 2).lineHeight).toBeNull();
  });

  it('svg: nur öffnender-Tag width/height skaliert, viewBox unverändert, % übersprungen', () => {
    const r = scalePlan({ type: 'svg', markup: '<svg width="24" height="24" viewBox="0 0 24 24"><rect width="10" height="10"/></svg>' }, 2);
    expect(r.markup).toContain('width="48"');
    expect(r.markup).toContain('height="48"');
    expect(r.markup).toContain('viewBox="0 0 24 24"');
    expect(r.markup).toContain('<rect width="10" height="10"/>'); // innerer Tag unberührt
    const pct = scalePlan({ type: 'svg', markup: '<svg width="100%" height="24"></svg>' }, 2);
    expect(pct.markup).toContain('width="100%"'); // übersprungen
    expect(pct.markup).toContain('height="48"');
  });

  it('component-ref: absolute + fallback rekursiv', () => {
    const r = scalePlan({ type: 'component-ref', name: 'Btn', variant: null,
      absolute: { x: 10, y: 10, width: 40, height: 20 }, fallback: box({ width: 40, padding: [2, 2, 2, 2] }) }, 3);
    expect(r.absolute).toEqual({ x: 30, y: 30, width: 120, height: 60 });
    expect(r.fallback.width).toBe(120);
    expect(r.fallback.padding).toEqual([6, 6, 6, 6]);
    expect(r.name).toBe('Btn');
  });

  // Katalog-Instanzen (Spec 2026-07-25-katalog-als-figma-library-design.md §Entscheidung 1):
  // die DS-Library liegt bei 1× in Figma, die Instanz trägt den Faktor als `scale` und das Plugin
  // ruft rescale() — nur Knoten, die sich per `catalogInstance` dafür melden.
  it('component-ref mit catalogInstance: bekommt scale = Faktor', () => {
    const r = scalePlan({ type: 'component-ref', name: 'DS/Button', variant: null, catalogInstance: true,
      fallback: box({ padding: [2, 2, 2, 2] }) }, 2.5);
    expect(r.scale).toBe(2.5);
    expect(r.fallback.padding).toEqual([5, 5, 5, 5]);
  });

  it('component-ref mit catalogInstance: vorhandenes scale wird multipliziert', () => {
    const r = scalePlan({ type: 'component-ref', name: 'DS/Button', variant: null, catalogInstance: true, scale: 2,
      fallback: null }, 3);
    expect(r.scale).toBe(6);
  });

  it('component-ref OHNE catalogInstance bekommt kein scale (scan-interne Instanz)', () => {
    const r = scalePlan({ type: 'component-ref', name: 'Kpi Card', variant: null, fallback: null }, 2);
    expect(r.scale).toBeUndefined();
  });

  it('Faktor 1 lässt den Baum identisch (auch Katalog-Instanzen bleiben ohne scale)', () => {
    const node = { type: 'component-ref', name: 'DS/Button', variant: null, catalogInstance: true, fallback: null };
    expect(scalePlan(node, 1)).toBe(node);
  });

  it('verschachtelt tief skaliert', () => {
    const r = scalePlan(box({ gap: 5, children: [text({ fontSize: 10 }), box({ width: 30, children: [text({ fontSize: 8 })] })] }), 2);
    expect(r.gap).toBe(10);
    expect(r.children[0].fontSize).toBe(20);
    expect(r.children[1].width).toBe(60);
    expect(r.children[1].children[0].fontSize).toBe(16);
  });
});
