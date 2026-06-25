import { buttonTemplate } from './button.js';
import { cardTemplate } from './card.js';
import { badgeTemplate } from './badge.js';
import { inputTemplate } from './input.js';

export const TEMPLATES = [buttonTemplate, cardTemplate, badgeTemplate, inputTemplate];

export function matchTemplate(name) {
  const n = String(name ?? '').toLowerCase();
  if (!n) return null;
  return TEMPLATES.find((t) => t.match(n)) ?? null;
}
