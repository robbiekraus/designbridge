import { buttonTemplate } from './button.js';
import { badgeTemplate } from './badge.js';
import { inputTemplate } from './input.js';

// Card-Template retired: eine Karte ist immer ein Inhaltscontainer, nie ein
// wiederverwendbares Leaf-Primitive — sie wird interpretiert (Bild) oder
// komponiert (Kinder vorhanden), nie generisch gestubbt (Leck 1 endgültig behoben).
export const TEMPLATES = [buttonTemplate, badgeTemplate, inputTemplate];

export function matchTemplate(name) {
  const n = String(name ?? '').toLowerCase();
  if (!n) return null;
  return TEMPLATES.find((tmpl) => tmpl.match(n)) ?? null;
}
