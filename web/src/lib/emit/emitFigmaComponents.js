// Kanonisches Inventar + Tokens → components[] des Figma-Payloads v2.
// Template-Wissen bleibt in den Templates (planFor); hier nur Orchestrierung.
// Scheibe 3: Bausteine ohne Hand-Template, aber mit KI-Interpretation (result.interpretations[name])
// bekommen jetzt einen echten Bauplan über htmlToPlan statt placeholder:true (Spec §Emitter-Integration).
import { matchTemplate } from '../components/templates/registry.js';
import { normalizeTokens } from './normalizeTokens.js';
import { pickTokenRefs } from './pickTokenRefs.js';
import { htmlToPlan } from './htmlToPlan.js';
import { composePlan } from './composePlan.js';
import { PREVIEW_VIRTUAL_WIDTH } from '../previewWidth.js';

// Export-Reihenfolge sichert die Atomic-Design-Hierarchie: Atome existieren in Figma,
// bevor ihre Verwender (Moleküle/Organismen/Templates) als component-ref auf sie zeigen
// (Ein-Durchlauf, Reihenfolge atom → molecule → organism → template).
const KINDS = [
  ['atoms', 'atom'],
  ['molecules', 'molecule'],
  ['organisms', 'organism'],
  ['templates', 'template'],
];

export function emitFigmaComponents(result) {
  const raw = result?.raw;
  if (!raw) return [];
  const normalizedTokens = normalizeTokens(raw.tokens);
  const refs = pickTokenRefs(normalizedTokens);

  // Dieselbe (disambiguierte!) Farbliste, aus der emitFigma/applyImport die realen
  // DesignBridge/Color/<name>-Styles bauen (normalizeTokens.assignNames vergibt bei
  // Kollision primary/primary-2/…) — htmlToPlan.matchColorToken matcht hier nur noch
  // per Hex und reicht .name unverändert durch, statt role erneut zu slugifien
  // (Review-Fix: sonst bindet applyFill silent an den falschen Style).
  const namedColors = normalizedTokens
    .filter((t) => t.group === 'color')
    .map((t) => ({ hex: t.value, name: t.name }));

  // knownComponents = ALLE Bausteine dieses Exports (jede Ebene), unabhängig davon, ob sie
  // gleich ein Template, einen KI-Plan oder nur einen Platzhalter bekommen: buildComponents.ts
  // legt für jeden Eintrag eine echte Figma-Komponente an (auch Platzhalter-Karten), component-refs
  // dürfen daher auf jeden Namen hier zeigen (Spec §Emitter-Integration).
  const knownComponents = [];
  for (const [rawKey, kind] of KINDS) {
    const items = Array.isArray(raw[rawKey]) ? raw[rawKey] : [];
    for (const item of items) knownComponents.push({ name: item.name, kind });
  }

  // Konverter-Warnungen (Tailwind-Klassen ignoriert, SVG gekappt, Konvertierung fehlgeschlagen, …)
  // laufen in den bestehenden warnings-Kanal (raw.warnings, von Dashboard.jsx angezeigt) statt in
  // einem neuen, ungenutzten Feld zu verschwinden.
  const converterWarnings = [];

  // Kompositions-Baum (Fundament + Figma-Port, Spec 2026-07-18-composition-nesting-figma-design.md
  // §PINNED CONTRACT 4): Bausteine MIT direkten Kindern werden aus component-ref-Instanzen ihrer
  // Kinder komponiert statt aus der (bei verschachtelten Bausteinen unzuverlässigen) monolithischen
  // Ganz-Baustein-Interpretation. Namens-Index über alle 4 Buckets, damit Kind-Items (mit bbox)
  // per Namen aufgelöst werden können.
  const composition = raw.composition || { children: {}, roots: [] };
  const itemByName = new Map();
  for (const [rawKey] of KINDS) {
    for (const item of (Array.isArray(raw[rawKey]) ? raw[rawKey] : [])) itemByName.set(item.name, item);
  }
  const iw = raw.meta?.image_width;
  const ih = raw.meta?.image_height;
  const canvas = {
    w: PREVIEW_VIRTUAL_WIDTH,
    h: iw && ih ? Math.round(PREVIEW_VIRTUAL_WIDTH * ih / iw) : PREVIEW_VIRTUAL_WIDTH,
  };

  const out = [];
  for (const [rawKey, kind] of KINDS) {
    const items = Array.isArray(raw[rawKey]) ? raw[rawKey] : [];
    for (const item of items) {
      const tpl = matchTemplate(item.name);
      const meta = {
        name: item.name,
        kind,
        confidence: item.confidence ?? null,
        source: item.source ?? null,
        notes: item.notes ?? null,
      };

      const childNames = composition.children?.[item.name];
      if (Array.isArray(childNames) && childNames.length) {
        const childItems = childNames.map((n) => itemByName.get(n)).filter(Boolean);
        out.push({
          ...meta,
          placeholder: false,
          source: 'composed',
          variants: [{ name: 'default', plan: composePlan(item, childItems, canvas) }],
        });
        continue;
      }

      if (tpl?.planFor) {
        out.push({
          ...meta,
          placeholder: false,
          variants: tpl.variants.map((v) => ({ name: v, plan: tpl.planFor(v, refs, item) })),
        });
        continue;
      }

      const interp = result?.interpretations?.[item.name];
      if (interp?.html) {
        const { plan, warnings } = htmlToPlan(interp.html, { tokens: { colors: namedColors }, knownComponents });
        if (warnings.length) converterWarnings.push(...warnings);
        if (plan) {
          out.push({
            ...meta,
            placeholder: false,
            source: 'ai-interpreted',
            variants: [{ name: 'default', plan }],
          });
          continue;
        }
        // plan === null (leeres/kaputtes HTML) → wie bisher Platzhalter, Warnung bleibt erhalten.
      }

      const names = Array.isArray(item.variants) && item.variants.length ? item.variants : ['default'];
      out.push({
        ...meta,
        placeholder: true,
        variants: names.map((v) => ({ name: String(v), plan: null })),
      });
    }
  }

  if (converterWarnings.length) {
    const existing = Array.isArray(raw.warnings) ? raw.warnings : [];
    raw.warnings = Array.from(new Set([...existing, ...converterWarnings]));
  }

  return out;
}
