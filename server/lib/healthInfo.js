import { aiKeyConfigured, aiProviderName } from './aiClient.js';

// Baut den /api/health-Payload. env injizierbar für Tests; Default = process.env.
// demo_fallback macht den Railway-Schalter DEMO_FALLBACK von außen sichtbar —
// ein erfolgreicher Scan beweist nichts über die Variable (Fallback greift nur
// bei Fehlern), deshalb muss der Status hier explizit raus.
export function buildHealthPayload(env = process.env) {
  const hasKey = !!env.ANTHROPIC_API_KEY && !env.ANTHROPIC_API_KEY.includes('...');
  return {
    status: 'ok',
    anthropic_key_configured: hasKey, // Back-Compat (Web-UI liest dieses Feld)
    ai_key_configured: aiKeyConfigured(),
    ai_provider: aiProviderName(),
    demo_fallback: env.DEMO_FALLBACK === '1',
    version: '0.1.1'
  };
}
