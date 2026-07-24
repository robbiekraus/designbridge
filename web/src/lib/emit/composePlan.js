// Komponiert einen Eltern-Baustein aus component-ref-Instanzen seiner direkten Kinder.
// Räumlich (alle bbox) → absolute Positionen; sonst Fluss (column, Reihenfolge).
// Vertrag: 2026-07-18-composition-nesting-figma-design.md §PINNED CONTRACT 4.
//
// Feldnamen 1:1 aus dem echten PlanBox-Vertrag (Single Source of Truth:
// web/src/lib/emit/htmlToPlan.js emptyBoxNode() + designbridge-plugin/src/writer/parsePayload.ts) —
// NICHT aus dem ursprünglichen Plan-Entwurf übernommen, der abweichende Feldnamen/Defaults hatte.

const clamp0 = (n) => Math.max(0, Math.round(n));

function boxDefaults(overrides = {}) {
  return {
    type: 'box',
    layout: 'column',
    padding: [0, 0, 0, 0],
    radius: 0,
    fill: null,
    stroke: null,
    strokeWeight: 1,
    gap: 0,
    width: null,
    height: null,
    primaryAlign: 'MIN',
    counterAlign: 'MIN',
    children: [],
    ...overrides,
  };
}

function ref(name, absolute) {
  // fallback: null (PlanRef-Vertrag erlaubt PlanBox|null, s. htmlToPlan.js) statt einer leeren
  // Box — eine leere Box wird bei erfolgreicher Referenz zwar verworfen, macht aber bei
  // FEHLGESCHLAGENER Auflösung ein unsichtbares, undiagnostizierbares Kästchen (Bug: „Suche"-
  // Component-Ref löste beim Figma-Import nicht auf → 2 leere Fallback-Kästchen, RESUME 20.07.).
  // Mit fallback:null greift renderComponentRef stattdessen der bestehende renderNotice()-Pfad:
  // ein sichtbarer gestrichelter Hinweis-Frame MIT dem fehlenden Namen im Text.
  const node = { type: 'component-ref', name, variant: null, fallback: null };
  if (absolute) node.absolute = absolute;
  return node;
}

export function composePlan(parentItem, childItems, canvas) {
  const spatial =
    parentItem?.bbox && childItems.length > 0 && childItems.every((c) => c && c.bbox);

  if (!spatial) {
    return boxDefaults({ children: childItems.map((c) => ref(c.name, null)) });
  }

  const p = parentItem.bbox;
  const children = childItems.map((c) =>
    ref(c.name, {
      x: clamp0((c.bbox.x - p.x) * canvas.w),
      y: clamp0((c.bbox.y - p.y) * canvas.h),
      width: Math.round(c.bbox.w * canvas.w),
      height: Math.round(c.bbox.h * canvas.h),
    })
  );
  return boxDefaults({
    width: Math.round(p.w * canvas.w),
    height: Math.round(p.h * canvas.h),
    children,
  });
}
