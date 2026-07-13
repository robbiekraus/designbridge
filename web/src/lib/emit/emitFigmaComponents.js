// Kanonisches Inventar + Tokens → components[] des Figma-Payloads v2.
// Template-Wissen bleibt in den Templates (planFor); hier nur Orchestrierung.
// Scheibe 3: Bausteine ohne Hand-Template, aber mit KI-Interpretation (result.interpretations[name])
// bekommen jetzt einen echten Bauplan über htmlToPlan statt placeholder:true (Spec §Emitter-Integration).
import { matchTemplate } from '../components/templates/registry.js';
import { normalizeTokens } from './normalizeTokens.js';
import { pickTokenRefs } from './pickTokenRefs.js';
import { htmlToPlan } from './htmlToPlan.js';

// Export-Reihenfolge sichert die Atomic-Design-Hierarchie: Atome existieren in Figma,
// bevor ihre Verwender (Moleküle/Organismen) als component-ref auf sie zeigen (Ein-Durchlauf).
const KINDS = [
  ['atomics', 'atomic'],
  ['components', 'component'],
  ['patterns', 'pattern'],
];

export function emitFigmaComponents(result) {
  const raw = result?.raw;
  if (!raw) return [];
  const refs = pickTokenRefs(normalizeTokens(raw.tokens));

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

      if (tpl?.planFor) {
        out.push({
          ...meta,
          placeholder: false,
          variants: tpl.variants.map((v) => ({ name: v, plan: tpl.planFor(v, refs) })),
        });
        continue;
      }

      const interp = result?.interpretations?.[item.name];
      if (interp?.html) {
        const { plan, warnings } = htmlToPlan(interp.html, { tokens: raw.tokens, knownComponents });
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
