// Zentraler KI-Provider-Umschalter (Anthropic ⇄ Gemini).
// Alle Callsites holen ihren Default-Client hier statt `new Anthropic(...)` —
// Fachlogik, Prompts und Tests (injizierte Fake-Clients) bleiben unberührt.
// Spec: docs/superpowers/specs/2026-07-15-gemini-provider-swap.md
import Anthropic from '@anthropic-ai/sdk';
import { makeGeminiClient } from './geminiClient.js';

function anthropicConfigured() {
  const k = process.env.ANTHROPIC_API_KEY;
  return !!k && !k.includes('...');
}

function geminiConfigured() {
  return !!process.env.GEMINI_API_KEY;
}

// Regel: explizites AI_PROVIDER gewinnt; sonst Anthropic wenn konfiguriert
// (bestehendes Verhalten), sonst Gemini wenn dessen Key da ist; letzter
// Fallback bleibt Anthropic, damit die alten Fehlerpfade unverändert greifen.
export function aiProviderName() {
  const forced = process.env.AI_PROVIDER;
  if (forced === 'gemini' || forced === 'anthropic') return forced;
  if (anthropicConfigured()) return 'anthropic';
  if (geminiConfigured()) return 'gemini';
  return 'anthropic';
}

// Ist irgendein Provider-Key vorhanden? (503-Guard in scan.js, /api/health)
export function aiKeyConfigured() {
  return anthropicConfigured() || geminiConfigured();
}

export function getAiClient() {
  if (aiProviderName() === 'gemini') return makeGeminiClient();
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}
