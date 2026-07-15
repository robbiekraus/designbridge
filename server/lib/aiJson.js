// Toleranter JSON-Extraktor für KI-Antworten.
// Live-Fund 15.07. (Testphase): gemini-3.1-flash-lite hängt intermittierend eine
// überzählige schließende Klammer ans Ende — die Antwort selbst ist vollständig
// und valide. JSON.parse scheitert an "Extra data". Statt die ganze Antwort zu
// verwerfen, wird hier das erste balancierte JSON-Objekt herausgelöst; Text
// davor (Preambles, Markdown-Zäune) und danach (Extra-Klammern) wird ignoriert.
export function extractJson(text) {
  const clean = String(text ?? '').replace(/```json\n?|```\n?/g, '').trim();
  const start = clean.indexOf('{');
  if (start === -1) throw new Error('Kein JSON-Objekt in der Antwort gefunden.');

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < clean.length; i++) {
    const ch = clean[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return JSON.parse(clean.slice(start, i + 1));
    }
  }
  throw new Error('JSON-Objekt ist unvollständig (nicht balanciert).');
}
