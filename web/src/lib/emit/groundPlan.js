// Plan→Plan-Grounding fürs Figma-Emit (Spec: docs/superpowers/specs/2026-07-25-komposition-
// gegroundeter-bausteine-design.md §Kernidee + §Entscheidung 4). Reine Funktion, KEIN DOM.
//
// Problem (gemessen, s. Spec §Entscheidung 4): das Figma-Plugin kennt das Feld `catalog` nicht und
// für Katalog-Einträge existiert dort keine Figma-Komponente → jeder gegroundete component-ref
// (htmlToPlan.js, matchCatalogComponent) läuft im Plugin auf „Komponente nicht gefunden" +
// freihändig gerenderten Fallback. `groundPlan` löst genau diese Katalog-Refs SCHON IM WEB-EMIT auf,
// nach derselben Vorrangregel wie der Code-Emit (planToJsx.js, Schritt 2 — dort per JSX-Emission,
// hier per Plan-Baum-Ersetzung): Katalog gewinnt für die Hülle (fill/stroke/strokeWeight/radius),
// die Interpretation (Fallback) gewinnt für Layout/Maße/Inhalt.
//
// Scan-interne component-refs (OHNE `catalog`-Feld — Atomic-Design-Verschachtelung, echte Figma-
// Instanzen) werden NICHT angefasst; nur ihr `fallback` wird weiter abgestiegen, weil darin
// verschachtelte Katalog-Refs stecken können (ein Molekül mit einem Badge z. B.).
//
// INSTANZ-MODUS (`{ instances: true }`, Spec 2026-07-25-katalog-als-figma-library-design.md): liegt der
// Katalog zusätzlich als echte Figma-Library im Payload (`emitFigmaCatalog`), wird ein BLATT-Ref nicht
// mehr inline aufgelöst, sondern zu einem `component-ref` auf `DS/<Name>` — echte ◇-Instanz in Figma.
// Der inline gegroundete Plan wandert dabei unverändert in den `fallback`, damit ein altes Plugin (und
// jeder Fehlerfall im neuen) genau das heutige Bild rendert. Container (Card) und Icon-Blätter bleiben
// inline — Figma-Instanzen nehmen keine neuen Kinder an.

import { catalogFigmaName, variantSelectionKey, catalogEntryHasFigmaComponent } from './emitFigmaCatalog.js';

/** Katalog-Eintrag per Name aus der (Array-)components-Liste der Option. Kein Katalog/keine Liste/
 *  kein Treffer → undefined (Aufrufer behandelt das als „Knoten unverändert lassen"). */
function findCatalogEntry(name, catalogOption) {
  if (!catalogOption || !Array.isArray(catalogOption.components)) return undefined;
  return catalogOption.components.find((c) => c?.name === name);
}

/** Varianten-Auswahl für `entry.plan(sel)` aus den Node-Props bauen — NUR Achsen, die
 *  `entry.variants` kennt (Spec §Vertrag: „nur Achsen, die entry.variants kennt"). Andere Props
 *  (z. B. `checked` bei Checkbox, das laut Default-Katalog kein Varianten-Feld ist) bleiben außen
 *  vor — deckungsgleich mit dem, was der Code-Emit (planToJsx) an Attributen rendert. */
function buildVariantSelection(entry, props) {
  const axes = entry.variants || {};
  const sel = {};
  for (const axis of Object.keys(axes)) {
    if (props && props[axis] != null) sel[axis] = props[axis];
  }
  return sel;
}

/** Sichtbaren Text eines Fallback-Subtrees einsammeln (Whitespace NICHT kollabiert — das macht der
 *  Aufrufer einmal am Ende). Steigt auch in `fallback` verschachtelter Refs ab (ein Ref-Knoten hat
 *  keine `children`, aber ein `fallback` — Spec §Vertrag: „Der Text-Sammler muss auch in fallbacks
 *  verschachtelter Refs absteigen"). Rein strukturell, kennt keinen Katalog. */
function collectFallbackText(node) {
  if (!node || typeof node !== 'object') return '';
  if (node.type === 'text') return node.content || '';
  if (node.type === 'component-ref') return collectFallbackText(node.fallback);
  if (Array.isArray(node.children)) return node.children.map((c) => collectFallbackText(c)).join(' ');
  return '';
}

/** Ersetzt den ERSTEN Textknoten (Dokument-/Kindreihenfolge, depth-first) in `node` durch `text`.
 *  Liefert `{ changed, node }` — `changed:false` heißt „nichts zu ersetzen gefunden", der Aufrufer
 *  behält dann den unveränderten Katalog-Plan (Spec: „Kein sichtbarer Text … → Katalog-Plan
 *  unverändert übernehmen" gilt symmetrisch auch, wenn der Katalog-Plan selbst gar keinen
 *  Textknoten hat, z. B. reine Icon-Darstellungen). Reine Funktion — baut nur den Pfad zum
 *  gefundenen Textknoten neu, der Rest des Baums bleibt strukturell (Referenz-)identisch. */
function replaceFirstTextNode(node, text) {
  if (!node || typeof node !== 'object') return { changed: false, node };
  if (node.type === 'text') return { changed: true, node: { ...node, content: text } };
  if (Array.isArray(node.children) && node.children.length) {
    for (let i = 0; i < node.children.length; i += 1) {
      const result = replaceFirstTextNode(node.children[i], text);
      if (result.changed) {
        const children = node.children.slice();
        children[i] = result.node;
        return { changed: true, node: { ...node, children } };
      }
    }
  }
  return { changed: false, node };
}

/** Container-Zweig (Spec §Entscheidung 4, erster Spiegelstrich): Hülle (fill/stroke/strokeWeight/
 *  radius) aus der Wurzel von `entry.plan(sel)`, Layout/Maße/Inhalt aus `node.fallback`, Kinder
 *  rekursiv gegroundet. `absolute`/`stretch`/`grow` vom Ref-Knoten, sonst von der Fallback-Wurzel
 *  (Spec §Vertrag). */
function groundContainer(node, entry, sel, catalogOption, opts) {
  const shell = entry.plan(sel);
  const fb = node.fallback;
  const groundedChildren = (fb.children || []).map((c) => groundNode(c, catalogOption, opts));

  const result = {
    type: 'box',
    layout: fb.layout,
    padding: fb.padding,
    radius: shell.radius ?? 0,
    fill: shell.fill ?? null,
    stroke: shell.stroke ?? null,
    strokeWeight: shell.strokeWeight ?? 1,
    gap: fb.gap,
    width: fb.width,
    height: fb.height,
    primaryAlign: fb.primaryAlign,
    counterAlign: fb.counterAlign,
    children: groundedChildren,
  };

  if (node.absolute) result.absolute = node.absolute;
  else if (fb.absolute) result.absolute = fb.absolute;
  if (node.stretch) result.stretch = true;
  else if (fb.stretch) result.stretch = true;
  if (node.grow) result.grow = true;
  else if (fb.grow) result.grow = true;

  return result;
}

/** Sichtbare SVG-Knoten eines Fallback-Subtrees einsammeln (Dokumentreihenfolge, beliebig tief,
 *  steigt auch in fallbacks verschachtelter Refs ab) — spiegelt collectFallbackText strukturell.
 *  Live-Fund 25.07. (Prod-Scan): ein Icon-Blatt (z. B. Button mit `size:'icon'`) hat im Fallback
 *  KEINEN Text, nur ein SVG; ohne diese Sammlung bliebe der generische Platzhalter-Glyph des
 *  Katalogs stehen statt des echten Icons der Vorlage. */
function collectFallbackSvgNodes(node) {
  if (!node || typeof node !== 'object') return [];
  if (node.type === 'svg') return [node];
  if (node.type === 'component-ref') return collectFallbackSvgNodes(node.fallback);
  if (Array.isArray(node.children)) return node.children.flatMap((c) => collectFallbackSvgNodes(c));
  return [];
}

/** Blatt-Zweig (Spec §Entscheidung 4, zweiter Spiegelstrich): der Knoten aus `entry.plan(sel)`
 *  (echte shadcn-Optik je Variante), dessen ersten Textknoten der ECHTE, sichtbare Fallback-Text
 *  ersetzt (Whitespace kollabiert + getrimmt). Kein sichtbarer Text im Fallback, aber ein SVG (Icon-
 *  Button & Co.) → die Kinder der Katalog-Plan-Wurzel werden durch die ECHTEN SVG-Knoten aus dem
 *  Fallback ersetzt (Live-Fund 25.07., Spec 2026-07-25 §Blatt-Zweig Figma-Weg): der Katalog rendert
 *  für `size:'icon'` nur ein generisches Plus-Zeichen, das echte Icon der Vorlage im Fallback soll
 *  gewinnen. Weder Text noch SVG im Fallback ODER Katalog-Plan hat gar keinen Textknoten/keine
 *  Kinder → Katalog-Plan unverändert. `absolute`/`stretch`/`grow` vom Ref-Knoten übernehmen. */
function groundLeaf(node, entry, sel) {
  const planNode = entry.plan(sel);
  // voidElement (Input & Co.) bekommt NIE Text ODER SVG injiziert — auch nicht, wenn der Fallback
  // (fälschlich) welchen trägt (Live-Fund 24.07., s. htmlToPlan.js-Kommentar zu voidElement).
  const skipText = Boolean(node.voidElement) || Boolean(entry.voidElement);
  const fallbackText = skipText ? '' : collectFallbackText(node.fallback).replace(/\s+/g, ' ').trim();

  let finalPlan = planNode;
  // mode dokumentiert, WORAUS das Blatt sein Aussehen bezieht — der Instanz-Modus (s. u.) darf nur
  // 'text' und 'plain' instanzieren: 'svg' hieße, echte Icon-Kinder in eine Figma-Instanz zu legen.
  let mode = 'plain';
  if (fallbackText) {
    const replaced = replaceFirstTextNode(planNode, fallbackText);
    if (replaced.changed) {
      finalPlan = replaced.node;
      mode = 'text';
    }
  } else if (!skipText) {
    const svgNodes = collectFallbackSvgNodes(node.fallback);
    if (svgNodes.length && Array.isArray(planNode.children)) {
      finalPlan = { ...planNode, children: svgNodes };
      mode = 'svg';
    }
  }

  return { plan: finalPlan, mode, text: fallbackText, skipText };
}

/** `absolute`/`stretch`/`grow` des Ref-Knotens auf das Ergebnis übernehmen (Spec §Vertrag). Gilt für
 *  den Inline-Plan genauso wie für einen Instanz-Ref — der `fallback` bleibt bewusst OHNE diese
 *  Felder, sonst würde das Plugin sie beim Fallback-Rendern doppelt anwenden. */
function withRefFlags(node, plan) {
  const result = { ...plan };
  if (node.absolute) result.absolute = node.absolute;
  if (node.stretch) result.stretch = true;
  if (node.grow) result.grow = true;
  return result;
}

/** Blatt → echte Figma-Instanz der DS-Library (Spec §Entscheidung 2/3/5). Nur wenn
 *  (a) der Instanz-Modus an ist, (b) der Eintrag überhaupt eine Figma-Komponente hat (Box-Wurzel)
 *  und (c) das Aussehen ohne neue Kinder erreichbar ist: entweder echter Text zum Überschreiben oder
 *  ein voidElement (Input), das per Vertrag nie Inhalt bekommt. Sonst null → Inline-Plan. */
function instanceRefFor(node, entry, sel, leaf) {
  if (!catalogEntryHasFigmaComponent(entry)) return null;
  const canInstance = leaf.mode === 'text' || (leaf.mode === 'plain' && leaf.skipText);
  if (!canInstance) return null;

  const key = variantSelectionKey(entry, sel);
  const ref = {
    type: 'component-ref',
    name: catalogFigmaName(entry.name),
    // 'default' heißt „Eintrag ohne Varianten-Achsen" → einzelne COMPONENT, kein Set: variant null,
    // damit das Plugin direkt instanziert statt eine Variante zu suchen.
    variant: key === 'default' ? null : key,
    catalogInstance: true,
    fallback: leaf.plan,
  };
  if (leaf.mode === 'text') ref.overrideText = leaf.text;
  return withRefFlags(node, ref);
}

/** Ein einzelner Knoten. box/text/svg unverändert (box steigt in Kinder ab), component-ref läuft
 *  über die beiden Zweige oben (Katalog-Ref) oder bleibt selbst unangetastet und steigt nur in
 *  seinen `fallback` ab (scan-interner Ref). */
function groundNode(node, catalogOption, opts) {
  if (!node || typeof node !== 'object') return node;

  if (node.type === 'component-ref') {
    if (!node.catalog) {
      // Scan-interner Ref (Atomic-Design-Verschachtelung, echte Figma-Instanz) — NICHT antasten,
      // aber in seinem Fallback können Katalog-Refs stecken (das Plugin rendert den Fallback, wenn
      // die Instanz-Auflösung selbst fehlschlägt — Spec §Vertrag).
      return node.fallback ? { ...node, fallback: groundNode(node.fallback, catalogOption, opts) } : node;
    }
    const entry = findCatalogEntry(node.name, catalogOption);
    if (!entry) return node; // unbekannter Name / kein Katalog übergeben → unverändert, kein Wurf.

    const sel = buildVariantSelection(entry, node.props);
    const fallbackHasChildren = Array.isArray(node.fallback?.children) && node.fallback.children.length > 0;
    const isContainer = Boolean(entry.container) && !entry.voidElement && fallbackHasChildren;
    if (isContainer) return groundContainer(node, entry, sel, catalogOption, opts);

    const leaf = groundLeaf(node, entry, sel);
    if (opts?.instances) {
      const ref = instanceRefFor(node, entry, sel, leaf);
      if (ref) return ref;
    }
    return withRefFlags(node, leaf.plan);
  }

  if (Array.isArray(node.children)) {
    return { ...node, children: node.children.map((c) => groundNode(c, catalogOption, opts)) };
  }

  // text/svg (oder jeder andere Blatttyp ohne children) — unverändert.
  return node;
}

/**
 * Löst alle Katalog-`component-ref`-Knoten (Feld `catalog` gesetzt) in `plan` rekursiv auf, nach der
 * Vorrangregel „Katalog gewinnt für die Hülle, Messung gewinnt für Layout/Maße/Inhalt" (Spec
 * §Kernidee). Scan-interne Refs (ohne `catalog`) bleiben `component-ref`-Knoten, ihr Fallback wird
 * aber weitergegroundet.
 *
 * @param {object} plan Kanonischer Plan-Baum (box/text/svg/component-ref).
 * @param {{ source: string, components: Array<object> }|null|undefined} [catalogOption] Dieselbe
 *   Katalog-Option, die `htmlToPlan` bekommt. Fehlend/leer → `plan` unverändert (kein Katalog-Ref
 *   kann dann aufgelöst werden, jeder findet `entry === undefined`).
 * @param {{ instances?: boolean }} [opts] `instances: true` → Blatt-Refs werden `component-ref`s auf
 *   die DS-Library (`DS/<Name>`) mit dem Inline-Plan als `fallback` (Spec 2026-07-25-katalog-als-
 *   figma-library-design.md). Ohne das Flag bleibt alles wie bisher inline.
 * @returns {object} Neuer Plan-Baum; ohne `instances` ohne jeden Katalog-`component-ref`.
 */
export function groundPlan(plan, catalogOption, opts) {
  return groundNode(plan, catalogOption, opts);
}
