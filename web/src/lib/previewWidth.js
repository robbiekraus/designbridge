// web/src/lib/previewWidth.js
// Vertrag (Spec docs/superpowers/specs/2026-07-17-testrunde8-fixes-design.md, Fix 1):
// Die Vorschau (InterpretedPreview.jsx) und die Figma-Vermessung (emit/htmlToPlan.js)
// nutzen DIESELBE virtuelle Breite, um KI-interpretiertes HTML zu rendern/messen.
// WYSIWYG: Was die Vorschaukarte zeigt, kommt so auch in Figma an. Sieht die Vorschau
// selbst falsch aus, ist das ein separates Interpretations-/Fidelity-Problem, kein
// Mess-Problem (siehe Spec §Fix 1 „Vertrag").
export const PREVIEW_VIRTUAL_WIDTH = 1024;
