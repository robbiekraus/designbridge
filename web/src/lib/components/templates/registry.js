import { buttonTemplate } from './button.js';

export const TEMPLATES = [buttonTemplate];

export function matchTemplate(name) {
  const n = String(name ?? '').toLowerCase();
  if (!n) return null;
  return TEMPLATES.find((t) => t.match(n)) ?? null;
}
