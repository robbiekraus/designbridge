// Der Teil des Scan-Prompts, der für JEDEN Quell-Typ gleich sein MUSS: wie in Atoms/Molecules/
// Organisms/Templates eingeteilt wird, und was in seine Bestandteile zerlegt werden soll.
//
// WARUM ES DAS GIBT: genau diese Doppelpflege war schon zweimal ein Bug.
//   • 26.07. — die DECOMPOSE-Anweisung nannte eine handgeschriebene Kurzliste statt des
//     Katalog-Vokabulars; die Aufstockung von 8 auf 17 shadcn-Komponenten wäre wirkungslos
//     geblieben, weil die neuen nie als eigener Baustein herausgezogen wurden.
//   • 27.07. — der URL-Pfad (recognizeWithAi.js) hatte die DECOMPOSE-Anweisung überhaupt nicht;
//     der Definitionsblock lag dort als wörtliche ZWEITE Kopie. Ein URL-Scan zerlegte seine
//     Organismen also nie in Kleinteile, während der Bild-Scan es tat.
//
// Deshalb: eine Quelle, importiert von claude.js (Bild) UND recognizeWithAi.js (URL).
// Der Text ist bewusst BYTE-GLEICH zur bisherigen Fassung im Bild-Pfad — ein bewährter Prompt
// wird beim Umzug nicht nebenbei umformuliert. Ein Test hält das fest.
//
// Vgl. die Architektur-Regel in CLAUDE.md: der Katalog hängt an drei Stellen zusammen. Dies ist
// die vierte, jetzt strukturell gesicherte Stelle.
import { SHADCN_VOCABULARY } from '../catalog/shadcnVocabulary.js';

/** Speist sich aus derselben Quelle wie das Grounding-Vokabular: erweitert man den Katalog,
 *  weitet sich automatisch mit, was der Scan überhaupt zerlegt. */
export const DECOMPOSITION_VOCABULARY = SHADCN_VOCABULARY.map((c) => c.name).join(', ');

export const CLASSIFICATION_DEFINITIONS = `Classify every UI element into exactly ONE of four atomic-design levels:
- "atoms": smallest indivisible UI elements — button, input field, label, icon, badge/chip, avatar, status dot, single checkbox/radio/toggle. If it can't be split into smaller meaningful UI parts, it's an atom.
- "molecules": a small group of atoms acting as ONE simple unit — search field (input + icon), dropdown/select (field + menu), one form field (label + input + hint), a list item (icon + text + value), a metric/stat pair (label + number), breadcrumb, pagination.
- "organisms": a larger self-contained section built from molecules and atoms — a card (KPI/stat card), a chart (bar/line/donut incl. its legend and axes), a data table, a full form, a navigation bar, a header/topbar, a sidebar navigation, a footer, a hero. If it's a distinct block you could lift out and reuse as a whole section, it's an organism.
- "templates": the overall screen layout — how organisms are arranged into a full screen (e.g. sidebar + topbar + content grid). Emit AT MOST ONE template for the whole screen.
CRITICAL: a card, a chart and a table are ORGANISMS, not molecules. A button and a bare input are ATOMS. The whole screen is the single TEMPLATE — never fold the individual sections into it, and never mark an individual section as a template.`;

export const DECOMPOSE_INSTRUCTION = `DECOMPOSE each organism into its reusable inner building blocks and add them to the appropriate "atoms"/"molecules" arrays IN ADDITION to the organism itself. Extract an inner element when it (a) repeats within the screen, OR (b) is a standard reusable building block — that means any of: ${DECOMPOSITION_VOCABULARY}, plus icons and status dots. Do NOT extract one-off decorative containers or every stray label. When an inner element repeats (e.g. sidebar nav items), emit it ONCE and set "instanceCount" to how many times it appears — never list the same element multiple times. For every extracted inner element set "partOf" to the exact "name" of the organism it belongs to, and give it a reusable generic name (e.g. "Nav Item", not "Dashboard nav item 3"). Top-level building blocks omit "partOf" and use "instanceCount": 1.`;
