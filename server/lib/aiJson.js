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
      if (depth === 0) {
        const candidate = clean.slice(start, i + 1);
        try { return JSON.parse(candidate); }
        catch (err) {
          // Live-Fund 24.07. (echter Prod-Scan): das Modell liefert im "html"-Feld gelegentlich
          // gültiges HTML, aber kaputtes JSON — (a) verschachtelte Anführungszeichen bleiben
          // unescaped (rohes <svg width="20" .../> in einem sonst korrekt escapten HTML-String),
          // oder (b) rohe Zeilenumbrüche stehen mitten im String (laut JSON-Spec ungültige
          // Steuerzeichen), wenn mehrzeiliges HTML "wie eingegeben" statt mit \n reproduziert wird.
          // Reparatur-Versuch statt sofortigem Aufgeben, dann neu geparst. Schlägt auch das fehl,
          // fliegt der ORIGINALE Fehler — keine stille Maskierung echter Brüche (z. B. am
          // Token-Limit abgeschnittene Antworten).
          try { return JSON.parse(repairMalformedJsonStrings(candidate)); }
          catch { throw err; }
        }
      }
    }
  }
  throw new Error('JSON-Objekt ist unvollständig (nicht balanciert).');
}

/** Repariert zwei Klassen kaputten JSONs, die von KI-Antworten mit HTML/SVG-Inhalt im "html"-Feld
 *  bekannt sind (Live-Fund 24.07.), in EINEM Durchlauf:
 *  1. Rohe `"` MITTEN in einem String werden escaped — erkannt daran, dass NICHT (ggf. nach
 *     Whitespace) einer der gültigen JSON-Terminatoren `, } ] :` oder das Textende folgt.
 *  2. Rohe Steuerzeichen (Zeilenumbruch/Tab/CR, laut JSON-Spec in Strings ungültig) werden zu ihrer
 *     `\n`/`\t`/`\r`-Escape-Sequenz.
 *  Ändert bereits korrekt escapte Zeichen oder außerhalb von Strings stehenden Text nicht. */
function repairMalformedJsonStrings(json) {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    if (!inString) {
      out += ch;
      if (ch === '"') inString = true;
      continue;
    }
    if (escaped) { out += ch; escaped = false; continue; }
    if (ch === '\\') { out += ch; escaped = true; continue; }
    if (ch === '"') {
      let j = i + 1;
      while (j < json.length && (json[j] === ' ' || json[j] === '\t' || json[j] === '\n' || json[j] === '\r')) j++;
      const next = json[j];
      if (next === undefined || ',}]:'.includes(next)) {
        inString = false;
        out += ch;
      } else {
        out += '\\"';
      }
      continue;
    }
    if (ch === '\n') { out += '\\n'; continue; }
    if (ch === '\r') { out += '\\r'; continue; }
    if (ch === '\t') { out += '\\t'; continue; }
    const code = ch.charCodeAt(0);
    if (code < 0x20) { out += `\\u${code.toString(16).padStart(4, '0')}`; continue; }
    out += ch;
  }
  return out;
}
