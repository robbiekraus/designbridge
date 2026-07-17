// web/src/lib/previewWidth.js
// Vertrag (Spec docs/superpowers/specs/2026-07-17-testrunde8-fixes-design.md, Fix 1):
// Die Vorschau (InterpretedPreview.jsx) und die Figma-Vermessung (emit/htmlToPlan.js)
// nutzen DIESELBE virtuelle Breite, um KI-interpretiertes HTML zu rendern/messen.
// WYSIWYG: Was die Vorschaukarte zeigt, kommt so auch in Figma an. Sieht die Vorschau
// selbst falsch aus, ist das ein separates Interpretations-/Fidelity-Problem, kein
// Mess-Problem (siehe Spec §Fix 1 „Vertrag").
export const PREVIEW_VIRTUAL_WIDTH = 1024;

// Scheibe B (Spec docs/superpowers/specs/2026-07-17-plan-fidelity-design.md): der Offscreen-
// Mess-Container in emit/htmlToPlan.js hatte bisher KEINE Höhe — Prozent-Höhen-Ketten
// (`height:100%` durchgereicht bis zu `height:30%` in Bar-Segmenten) lösen ohne einen Höhen-
// Kontext zu 0px auf, obwohl dieselbe Vorschau in der iframe-Kette (die eine Höhe hat) korrekt
// aussieht — ein Verstoß gegen den WYSIWYG-Vertrag auf der Mess-Seite (Vorschau = Figma-
// Vermessung). PREVIEW_VIRTUAL_HEIGHT gibt dem Mess-Container eine feste virtuelle Höhe, rein
// additiv (nur der Mess-Container bekommt sie, nicht die sichtbare Vorschaukarte), damit
// Prozent-Höhen etwas zum Auflösen haben.
export const PREVIEW_VIRTUAL_HEIGHT = 768;
