import { buttonTemplate } from './button.js';
import { badgeTemplate } from './badge.js';
import { inputTemplate } from './input.js';

// Card-Template retired: eine Karte ist immer ein Inhaltscontainer, nie ein
// wiederverwendbares Leaf-Primitive — sie wird interpretiert (Bild) oder
// komponiert (Kinder vorhanden), nie generisch gestubbt (Leck 1 endgültig behoben).
export const TEMPLATES = [buttonTemplate, badgeTemplate, inputTemplate];

// Live-Fund 27.07. (Robs Sunstone-Scan): "Date Range Dropdown Button" und "User Dropdown
// Button" matchten per Namensteil ("butt") das generische Button-Template — ein Trigger mit
// Icon+Label+Chevron wurde so als leerer Farbklecks in Default-Größe gerendert (falsche
// Position, weil das Template nie die gemessene bbox sieht). Ein Dropdown-Trigger ist genau
// der Fall, den shadcnVocabulary.js bewusst ausschließt ("Select/DropdownMenu fehlen bewusst
// — Radix-Wurzel ohne Pflicht-Unterkomponenten rendert nichts"): er braucht echte
// Interpretation, keinen generischen Button. Analog "Search Input Bar" (matcht "Input")
// gegen das generische Input-Template — ein Icon+Label-Suchfeld wurde zur nackten
// "Wert eingeben…"-Box. Gleiches Fix-Muster wie das retired Card-Template (Commit 623fc35,
// CONTENT_TOKENS): ein inhaltlich reicherer Name darf die atomare Vorlage NICHT kapern,
// sondern muss zur echten KI-Interpretation durchgereicht werden (componentsNeedingInterpretation
// in interpret.js hängt genau an diesem Rückgabewert).
const DROPDOWN_TOKENS = /\b(dropdown|select|menu)\b/;
const COMPOUND_CONTAINER_TOKENS = /\bbar\b/;

// Live-Fund 27.07. nachmittags (Robs EcoMetrics-Scan, Testdaten/ecometrics-scan-27-07-
// nachmittag.json): "Badge: Premium" und "Button: Export" matchten per Namensteil ("badge",
// "butt") ihr EIGENES generisches Template und landeten nie in componentsNeedingInterpretation —
// anders als der Dropdown/Bar-Fall oben ist hier keine Ausschluss-Token-Liste möglich, weil der
// Namensteil, der matcht, exakt die Kategorie selbst ist (ein Badge heißt nun mal "Badge: …").
// "Search Bar Input" (dieselbe Datei) zeigte, dass die Dropdown/Bar-Token-Ausnahme oben bereits
// korrekt funktioniert (matcht "bar" per Wortgrenze, Template wird schon verweigert) — das
// Fehlen der Interpretation dort ist ein separates Timing-/Pipeline-Thema, kein Registry-Bug.
// Generischere Regel statt weiterer Einzel-Token-Listen: JEDER Name im Scanner-Namensformat
// "Kategorie: Konkreter Name" (siehe auch funktionierende Fälle wie "KPI Card: Biogenic
// Emissions", "Dropdown: Country Filter" — die matchen ohnehin kein TEMPLATES-Regex) signalisiert
// eine vom Scanner konkret benannte Instanz und muss IMMER zur echten Interpretation, unabhängig
// davon, welches Template zufällig den ersten Namensteil trifft. Gleiches Prinzip wie das retired
// Card-Template (Commit 623fc35, CONTENT_TOKENS) und der Dropdown/Bar-Fix (dbdbbab): ein
// inhaltlich reicherer Name darf die atomare Vorlage nie kapern.
const NAMED_INSTANCE_PATTERN = /:\s*\S/;

export function matchTemplate(name) {
  const n = String(name ?? '').toLowerCase();
  if (!n) return null;
  if (NAMED_INSTANCE_PATTERN.test(n)) return null;
  const t = TEMPLATES.find((tmpl) => tmpl.match(n)) ?? null;
  if (!t) return null;
  if (t === buttonTemplate && DROPDOWN_TOKENS.test(n)) return null;
  if (t === inputTemplate && COMPOUND_CONTAINER_TOKENS.test(n)) return null;
  return t;
}
