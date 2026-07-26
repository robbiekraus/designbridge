// Baut die Design-System-Bibliothek (`catalog` im Payload) als echte Figma-Komponenten.
// Spec: docs/superpowers/specs/2026-07-25-katalog-als-figma-library-design.md.
//
// Unterschiede zu buildComponents.ts (gescannte Bausteine) — bewusst eine eigene Datei statt eines
// weiteren `kind`:
//   · Namen kommen FERTIG namespaced aus dem Web-Emit (`DS/Button`) und werden wörtlich genommen.
//   · Varianten-Kinder heißen wie im Payload (`variant=secondary, size=lg`) — echte Figma-Varianten-
//     Properties. Bei gescannten Bausteinen ist es `Variant=<name>` (eine einzige Achse).
//   · Genau EINE Variante namens `default` → einzelne COMPONENT statt eines Sets mit einem Kind.
//   · Keine Platzhalter-Karten: ein Eintrag ohne gültigen Bauplan wird übersprungen (der Parser
//     lässt solche Einträge ohnehin nicht durch).
import { ImportCatalogEntry } from './parsePayload';
import type { SectionFrames } from './buildComponents';
import { renderPlan } from './renderPlan';
import { layOutVariants } from './variantLayout';

export interface CatalogBuildResult {
  created: number;
  updated: number;
  skipped: string[];
}

function findByName(section: FrameNode, name: string): SceneNode | undefined {
  return section.children.find((c) => c.name === name);
}

/** Bestehenden Eintrag gleichen Namens durch `fresh` ersetzen (Position halten) oder anhängen.
 *  Liefert 'updated' | 'created' für die Zählung. */
function placeNode(section: FrameNode, name: string, fresh: SceneNode): 'updated' | 'created' {
  const existing = findByName(section, name);
  if (!existing) {
    section.appendChild(fresh);
    return 'created';
  }
  const idx = section.children.indexOf(existing);
  section.insertChild(idx, fresh);
  existing.remove();
  return 'updated';
}

/**
 * Legt je Katalog-Eintrag eine Komponente (bzw. ein Component Set) in die Katalog-Sektion.
 *
 * @param entries Geparste `catalog`-Liste.
 * @param section Die Sektion `DB/Design System` (upsertPage).
 * @param paintByName Farb-Styles wie bei buildComponents — Katalog-Pläne referenzieren dieselben Tokens.
 * @param sections Optional; nur relevant, falls ein Katalog-Plan selbst einen component-ref enthält.
 *   Ohne Angabe zeigt jede Ebene auf die Katalog-Sektion (DS-Einträge können sich gegenseitig
 *   referenzieren, Fremdes findet der Ref nicht — Fallback greift).
 */
export async function buildCatalogComponents(
  entries: ImportCatalogEntry[],
  section: FrameNode,
  paintByName: Map<string, PaintStyle>,
  sections?: SectionFrames
): Promise<CatalogBuildResult> {
  const result: CatalogBuildResult = { created: 0, updated: 0, skipped: [] };
  const refSections: SectionFrames = sections ?? {
    catalog: section, atom: section, molecule: section, organism: section, template: section,
  };

  for (const entry of entries) {
    // Wie in buildComponents.ts vor dem try deklariert, damit der catch bereits erzeugte Nodes
    // abräumen kann — halb gebaute Komponenten wären sonst Waisen im Assets-Panel.
    const variantComponents: ComponentNode[] = [];
    let pending: SceneNode | null = null;
    try {
      for (const v of entry.variants) {
        if (!v.plan) {
          result.skipped.push(`${entry.name}/${v.name}: ungültiger Bauplan`);
          continue;
        }
        pending = await renderPlan(v.plan, paintByName, result.skipped, refSections);
        const c = figma.createComponentFromNode(pending);
        pending = c;
        c.name = v.name;
        variantComponents.push(c);
        pending = null;
      }

      if (variantComponents.length === 0) {
        result.skipped.push(`${entry.name}: keine gültigen Varianten`);
        continue;
      }

      // Einzel-Komponente: genau eine Variante, und die heißt 'default' (= Eintrag ohne
      // Varianten-Achsen). Ein Set mit einem Kind wäre in Figma unnötiger Ballast.
      if (variantComponents.length === 1 && entry.variants[0]?.name === 'default') {
        const single = variantComponents[0];
        single.name = entry.name;
        const how = placeNode(section, entry.name, single);
        result[how] += 1;
        continue;
      }

      const existing = findByName(section, entry.name);
      if (existing && existing.type === 'COMPONENT_SET') {
        // Set-Identität halten: erst neue Varianten anhängen, dann alte entfernen (ein Set darf nie
        // leer werden) — dieselbe Reihenfolge und derselbe Grund wie in buildComponents.ts.
        const old = [...existing.children];
        for (const c of variantComponents) existing.appendChild(c);
        for (const o of old) o.remove();
        layOutVariants(variantComponents);
        result.updated += 1;
        continue;
      }

      let idx = -1;
      if (existing) {
        idx = section.children.indexOf(existing);
        existing.remove();
      }
      layOutVariants(variantComponents);
      const set = figma.combineAsVariants(variantComponents, section);
      set.name = entry.name;
      if (idx >= 0) section.insertChild(idx, set);
      result[idx >= 0 ? 'updated' : 'created'] += 1;
    } catch (err) {
      for (const c of variantComponents) {
        try { c.remove(); } catch { /* z. B. schon in ein Set gewandert */ }
      }
      if (pending) {
        try { pending.remove(); } catch { /* bereits entfernt */ }
      }
      result.skipped.push(`${entry.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}
