import { buttonTemplate } from './button.js';
import { cardTemplate } from './card.js';
import { badgeTemplate } from './badge.js';
import { inputTemplate } from './input.js';

export const TEMPLATES = [buttonTemplate, cardTemplate, badgeTemplate, inputTemplate];

// Inhaltstragende Bausteine gehören interpretiert, nicht generisch bemalt:
// ein "… Card/Tile/Panel" mit spezifischem Inhalt (Chart, Metrik, Karte …)
// darf NICHT vom generischen Card-Template gekapert werden (Leck 1).
const CONTENT_TOKENS = /\b(chart|graph|stat|metric|kpi|map|line|bar|donut|pie|area|sparkline|activity|feed|list|table|calendar|timeline|gauge|progress|heatmap)\b/;

export function matchTemplate(name) {
  const n = String(name ?? '').toLowerCase();
  if (!n) return null;
  const t = TEMPLATES.find((tmpl) => tmpl.match(n)) ?? null;
  if (!t) return null;
  // Nur das Card-Template wird durch inhaltstragende Tokens „entschärft".
  if (t === cardTemplate && CONTENT_TOKENS.test(n)) return null;
  return t;
}
