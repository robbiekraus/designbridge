// Enthaltungs-Guard (Ansatz B, docs/superpowers/specs/2026-07-18-atomic-design-taxonomy-design.md).
// Deterministisches Sicherheitsnetz oben auf den (nicht-deterministischen)
// KI-/Regel-Klassifikationen: erzwingt Robs systematischen Fehler strukturell
// über die Komposition — nicht über Prompt-Bauchgefühl.
//
// Quellen-agnostisch: items = flache Liste { name, kind, ref }; areaOf(ref) und
// contains(a, b) werden von außen injiziert (Bild-Pfad: bbox-basiert; ein
// späterer URL/Repo-Pfad könnte DOM-basiert liefern).

export const CONTAIN_RATIO = 0.75; // B liegt zu >= 75% seiner Fläche in A UND A ist flächengrößer -> A enthält B
export const CANVAS_RATIO = 0.80; // deckt (mind.) den Screen ab -> Kandidat für Template-Boden
export const SECTION_RATIO = 0.05; // Mindestgröße für den Organism-Boden -> schützt kleine Moleküle (z.B. KPI-Kachel)

const RANK = { atom: 0, molecule: 1, organism: 2, template: 3 };

function countContained(items, index, contains) {
  const a = items[index];
  let count = 0;
  for (let j = 0; j < items.length; j++) {
    if (j === index) continue;
    if (contains(a.ref, items[j].ref)) count++;
  }
  return count;
}

/**
 * classifyByContainment(items, { areaOf, contains }) -> items mit korrigiertem kind.
 *
 * Regeln (in dieser Reihenfolge):
 * 1. Template-Boden (hart): die flächengrößte Einheit, die (a) Fläche >= CANVAS_RATIO
 *    hat UND (b) >= 2 andere erkannte Einheiten enthält -> kind = 'template'. Setzt
 *    auch runter. Höchstens EINE.
 * 2. Organism-Boden (promote-only): jede übrige Einheit, die >= 2 andere enthält UND
 *    Fläche >= SECTION_RATIO hat -> mindestens 'organism' (nie zurück auf atom/molecule).
 */
export function classifyByContainment(items, { areaOf, contains }) {
  if (!Array.isArray(items) || items.length === 0) return [];

  const result = items.map((item) => ({ ...item }));

  // Regel 1: Template-Boden — Kandidaten sammeln, dann den flächengrößten wählen.
  let templateIndex = -1;
  let templateArea = -1;
  for (let i = 0; i < result.length; i++) {
    const area = areaOf(result[i].ref);
    if (area < CANVAS_RATIO) continue;
    if (countContained(result, i, contains) < 2) continue;
    if (area > templateArea) {
      templateArea = area;
      templateIndex = i;
    }
  }
  if (templateIndex !== -1) {
    result[templateIndex].kind = 'template'; // setzt auch runter, falls vorher z.B. organism
  }

  // Regel 2: Organism-Boden (promote-only), auf die übrigen Einheiten.
  for (let i = 0; i < result.length; i++) {
    if (i === templateIndex) continue;
    const area = areaOf(result[i].ref);
    if (area < SECTION_RATIO) continue;
    if (countContained(result, i, contains) < 2) continue;
    if (RANK[result[i].kind] === undefined || RANK[result[i].kind] < RANK.organism) {
      result[i].kind = 'organism';
    }
  }

  return result;
}

/**
 * buildCompositionTree(items, { areaOf, contains }) -> { children, roots }
 * Direkter Elternteil von B = der flächenKLEINSTE A (A≠B) mit contains(A,B).
 * Nur direkte Kanten. Kinder je Elternteil in Lesereihenfolge (y, dann x der ref).
 * Quellen-agnostisch: contains/areaOf injiziert (Bild: bbox; Repo: eigener Aufruf).
 */
export function buildCompositionTree(items, { areaOf, contains }) {
  const children = {};
  const hasParent = new Set();
  for (let i = 0; i < items.length; i++) {
    const b = items[i];
    let parentIdx = -1;
    let parentArea = Infinity;
    for (let j = 0; j < items.length; j++) {
      if (j === i) continue;
      if (!contains(items[j].ref, b.ref)) continue;
      const a = areaOf(items[j].ref);
      if (a < parentArea) { parentArea = a; parentIdx = j; }
    }
    if (parentIdx !== -1) {
      const pName = items[parentIdx].name;
      (children[pName] ??= []).push(b);       // push item; sort+map to names below
      hasParent.add(b.name);
    }
  }
  // Kinder nach y, dann x sortieren und auf Namen reduzieren.
  const readY = (ref) => (ref && typeof ref.y === 'number' ? ref.y : 0);
  const readX = (ref) => (ref && typeof ref.x === 'number' ? ref.x : 0);
  for (const key of Object.keys(children)) {
    children[key] = children[key]
      .slice()
      .sort((p, q) => (readY(p.ref) - readY(q.ref)) || (readX(p.ref) - readX(q.ref)))
      .map((c) => c.name);
  }
  const roots = items.filter((x) => !hasParent.has(x.name)).map((x) => x.name);
  return { children, roots };
}

/**
 * parentByName(items, { areaOf, contains }) -> { [childName]: parentName }
 * Invertiert buildCompositionTree: für jedes Kind sein direkter Elternteil
 * (der flächenkleinste enthaltende Container). Nur direkte Kanten.
 */
export function parentByName(items, { areaOf, contains }) {
  const { children } = buildCompositionTree(items, { areaOf, contains });
  const parent = {};
  for (const [parentName, childNames] of Object.entries(children)) {
    for (const childName of childNames) parent[childName] = parentName;
  }
  return parent;
}
