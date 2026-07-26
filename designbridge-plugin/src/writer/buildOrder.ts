// Bau-Reihenfolge der Bausteine nach ihren Abhängigkeiten (Writer-Ordering, 27.07.2026).
//
// PROBLEM: `renderPlan` löst einen `component-ref` über `findComponentByName` auf, und das
// durchsucht ausschließlich die Kinder der Sektions-Frames — also nur, was schon GEBAUT ist.
// `buildComponents` lief bisher stur in Payload-Reihenfolge. Splict ein Organismus einen anderen
// ein, der weiter hinten in der Payload steht, findet der Ref nichts und der (sichtbar schlechtere)
// Fallback wird gerendert. Robs E2E-Lauf vom 27.07.: „Komponente „Popular Categories Card" nicht
// gefunden — Fallback gerendert" (dito Conversion History Card), beide in `Left Sidebar Navigation`.
//
// LÖSUNG: vor dem Bauen topologisch sortieren — Abhängigkeiten zuerst. Stabil, d. h. ohne
// Abhängigkeiten bleibt die Payload-Reihenfolge exakt erhalten.
//
// BEWUSSTE FOLGE: liegen Abhängigkeiten innerhalb DERSELBEN Sektion, ändert sich dort die
// Anordnung der Bausteine (die Sektion nimmt sie in Bau-Reihenfolge auf). Das ist der Preis und
// ein guter Tausch: betroffen sind genau die Fälle, in denen vorher ein Fallback statt der echten
// Instanz stand; die neue Reihenfolge (Bestandteile vor dem Zusammengesetzten) ist zudem die
// natürlichere Lesart.
//
// NICHT betroffen ist der Katalog (`DS/…`): die Sektion wird ohnehin vor allen Bausteinen gebaut
// (s. SectionFrames in buildComponents.ts), Refs darauf sind hier also keine Abhängigkeit.
import { ImportComponent, PlanNode } from './parsePayload';

/** Alle `component-ref`-Namen eines Plan-Teilbaums einsammeln — inklusive Fallback-Bäume,
 *  denn wird ein Fallback gerendert, laufen seine Refs durch dieselbe Auflösung. */
function collectRefNames(node: PlanNode, into: Set<string>): void {
  if (node.type === 'component-ref') {
    into.add(node.name);
    if (node.fallback) collectRefNames(node.fallback, into);
    return;
  }
  if (node.type === 'box') {
    for (const child of node.children) collectRefNames(child, into);
  }
}

function dependenciesOf(comp: ImportComponent): Set<string> {
  const refs = new Set<string>();
  for (const v of comp.variants) {
    if (v.plan) collectRefNames(v.plan, refs);
  }
  return refs;
}

/** Bausteine so umsortieren, dass jeder eingesplicte Baustein vor dem steht, der ihn einsplict.
 *  Stabil; Zyklen und Selbstreferenzen brechen nicht ab (dort bleibt es beim Fallback für den
 *  Baustein, der die Kante zurück schließt — genau der Status quo). Liefert IMMER dieselbe
 *  Menge und Anzahl Elemente wie die Eingabe. */
export function orderComponentsByDependency(components: ImportComponent[]): ImportComponent[] {
  // Namen können in einer fehlerhaften Payload doppelt vorkommen. Wir lösen einen Namen auf den
  // ERSTEN Träger auf — dieselbe Regel, die `findComponentByName` in Figma faktisch anwendet.
  const byName = new Map<string, ImportComponent>();
  for (const comp of components) {
    if (!byName.has(comp.name)) byName.set(comp.name, comp);
  }

  const ordered: ImportComponent[] = [];
  const done = new Set<ImportComponent>();
  const onPath = new Set<ImportComponent>();

  const visit = (comp: ImportComponent): void => {
    if (done.has(comp)) return;
    // Zyklus: die zurückführende Kante wird ignoriert, statt in die Endlosschleife zu laufen.
    if (onPath.has(comp)) return;
    onPath.add(comp);
    for (const name of dependenciesOf(comp)) {
      const dep = byName.get(name);
      if (dep && dep !== comp) visit(dep);
    }
    onPath.delete(comp);
    if (done.has(comp)) return;
    done.add(comp);
    ordered.push(comp);
  };

  for (const comp of components) visit(comp);
  // Namensdubletten: der zweite Träger wurde über byName nie besucht, darf aber nicht verloren gehen.
  for (const comp of components) {
    if (!done.has(comp)) {
      done.add(comp);
      ordered.push(comp);
    }
  }
  return ordered;
}
