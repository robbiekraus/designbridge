import { aiKeyConfigured, aiProviderName } from './aiClient.js';

// Baut den /api/health-Payload. env injizierbar für Tests; Default = process.env.
// demo_fallback macht den Railway-Schalter DEMO_FALLBACK von außen sichtbar —
// ein erfolgreicher Scan beweist nichts über die Variable (Fallback greift nur
// bei Fehlern), deshalb muss der Status hier explizit raus.
// Der zweite Railway-Service (Wurzel storybook-harness/), der die Live-Vorschau baut.
// Als Default im Code, damit der Live-Betrieb nicht an einer im Dashboard vergessenen
// Variable hängt. STORYBOOK_BUILDER_URL überschreibt das jederzeit.
const RAILWAY_STORYBOOK_BUILDER_URL = 'https://extraordinary-encouragement-production-d73d.up.railway.app';

// Leer lassen, wenn wir NICHT auf Railway laufen: lokal soll das Web auf seinen eigenen
// Default (localhost:4400) fallen, statt gegen den Live-Dienst zu funken (dessen CORS
// ohnehin nur die Prod-Domain erlaubt). RAILWAY_ENVIRONMENT_NAME setzt Railway selbst.
function resolveStorybookBuilderUrl(env) {
  if (env.STORYBOOK_BUILDER_URL) return env.STORYBOOK_BUILDER_URL;
  if (env.RAILWAY_ENVIRONMENT_NAME) return RAILWAY_STORYBOOK_BUILDER_URL;
  return '';
}

export function buildHealthPayload(env = process.env) {
  const hasKey = !!env.ANTHROPIC_API_KEY && !env.ANTHROPIC_API_KEY.includes('...');
  return {
    status: 'ok',
    anthropic_key_configured: hasKey, // Back-Compat (Web-UI liest dieses Feld)
    ai_key_configured: aiKeyConfigured(),
    ai_provider: aiProviderName(),
    demo_fallback: env.DEMO_FALLBACK === '1',
    // Adresse des Storybook-Builder-Dienstes. Bewusst zur LAUFZEIT ausgeliefert und
    // nicht als VITE_-Variable ins Bundle gebacken: build-time-Variablen fehlen still,
    // wenn sie erst nach dem Build gesetzt (oder in Railway maskiert) werden — der
    // Klick ging dann gegen den Default localhost:4400 statt gegen den echten Dienst.
    storybook_builder_url: resolveStorybookBuilderUrl(env),
    version: '0.1.1'
  };
}
