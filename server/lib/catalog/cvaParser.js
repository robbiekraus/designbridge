// Fokussierter, struktureller Parser für class-variance-authority (cva) — DS-Grounding Scheibe 2.
// Liest die reguläre shadcn-Form:
//   cva("<base>", { variants: { <achse>: { <option>: "<klassen>" } }, defaultVariants: {...} })
// und liefert { base, variants: { achse: { option: klassen } }, defaultVariants: { achse: option } }.
//
// BEWUSST kein vollständiger TS-AST (Non-Goal der Spec) — nur ein Zeichen-Scanner, der Strings und
// verschachtelte Klammern korrekt überspringt. Ungewohnte Formen (kein cva, tv() etc.) degradieren
// sauber auf { base:'', variants:{}, defaultVariants:{} } statt zu werfen.

const QUOTES = new Set(["'", '"', '`']);
const OPENERS = { '(': ')', '{': '}', '[': ']' };
const CLOSERS = new Set([')', '}', ']']);

/** Ab einem öffnenden Anführungszeichen bei i: Index des schließenden Anführungszeichens
 *  (Escapes berücksichtigt). Bei fehlendem Ende: letztes Zeichen. */
function skipString(src, i) {
  const q = src[i];
  for (let j = i + 1; j < src.length; j++) {
    if (src[j] === '\\') { j += 1; continue; }
    if (src[j] === q) return j;
  }
  return src.length - 1;
}

/** src[openIdx] ist ( { oder [. Index der zugehörigen schließenden Klammer, Strings/Nester beachtet. */
function matchBracket(src, openIdx) {
  const stack = [];
  for (let i = openIdx; i < src.length; i += 1) {
    const c = src[i];
    if (QUOTES.has(c)) { i = skipString(src, i); continue; }
    if (OPENERS[c]) stack.push(OPENERS[c]);
    else if (CLOSERS.has(c)) {
      stack.pop();
      if (stack.length === 0) return i;
    }
  }
  return -1;
}

/** Zerlegt einen Objekt-/Argument-Körper an Top-Level-Kommas (Strings/Nester beachtet). */
function splitTopLevel(body) {
  const parts = [];
  const stack = [];
  let start = 0;
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i];
    if (QUOTES.has(c)) { i = skipString(body, i); continue; }
    if (OPENERS[c]) stack.push(OPENERS[c]);
    else if (CLOSERS.has(c)) stack.pop();
    else if (c === ',' && stack.length === 0) { parts.push(body.slice(start, i)); start = i + 1; }
  }
  parts.push(body.slice(start));
  return parts.map((s) => s.trim()).filter((s) => s.length);
}

/** Trennt einen Objekteintrag am ersten Top-Level-Doppelpunkt in [key, valueToken]. */
function splitKeyValue(entry) {
  const stack = [];
  for (let i = 0; i < entry.length; i += 1) {
    const c = entry[i];
    if (QUOTES.has(c)) { i = skipString(entry, i); continue; }
    if (OPENERS[c]) stack.push(OPENERS[c]);
    else if (CLOSERS.has(c)) stack.pop();
    else if (c === ':' && stack.length === 0) return [entry.slice(0, i), entry.slice(i + 1)];
  }
  return [entry, ''];
}

/** Schlüssel entkernen: gequotet ('x'/"x") → x, sonst getrimmt (Identifier). */
function cleanKey(k) {
  const t = k.trim();
  if (t.length >= 2 && QUOTES.has(t[0])) return t.slice(1, -1);
  return t;
}

/** Alle String-Literale in einem Token auslesen und mit Leerzeichen fügen
 *  ("a" + "b" → "a b"; deckt shadcns umgebrochene Einzel-Strings ab). */
function readStringValue(token) {
  let out = '';
  for (let i = 0; i < token.length; i += 1) {
    if (QUOTES.has(token[i])) {
      const end = skipString(token, i);
      const piece = token.slice(i + 1, end);
      out += (out ? ' ' : '') + piece;
      i = end;
    }
  }
  return out.trim();
}

/** Objekt-Token (inkl. Klammern) → [ [key, valueToken], … ] auf oberster Ebene. */
function objectEntries(objText) {
  const open = objText.indexOf('{');
  if (open === -1) return [];
  const close = matchBracket(objText, open);
  if (close === -1) return [];
  const body = objText.slice(open + 1, close);
  return splitTopLevel(body).map((entry) => {
    const [k, v] = splitKeyValue(entry);
    return [cleanKey(k), v.trim()];
  });
}

/** Parst einen cva-Aufruf aus Quelltext. Siehe Kopf für Format & Degradations-Verhalten. */
export function parseCva(source) {
  const empty = { base: '', variants: {}, defaultVariants: {} };
  if (typeof source !== 'string') return empty;
  const idx = source.indexOf('cva(');
  if (idx === -1) return empty;
  const parenIdx = idx + 3; // Index des '(' hinter "cva"
  const end = matchBracket(source, parenIdx);
  if (end === -1) return empty;

  const args = splitTopLevel(source.slice(parenIdx + 1, end));
  if (args.length === 0) return empty;

  const base = readStringValue(args[0]);
  const variants = {};
  const defaultVariants = {};

  if (args[1]) {
    for (const [key, val] of objectEntries(args[1])) {
      if (key === 'variants') {
        for (const [axis, axisObj] of objectEntries(val)) {
          const opts = {};
          for (const [opt, cls] of objectEntries(axisObj)) opts[opt] = readStringValue(cls);
          variants[axis] = opts;
        }
      } else if (key === 'defaultVariants') {
        for (const [axis, dv] of objectEntries(val)) defaultVariants[axis] = readStringValue(dv);
      }
    }
  }

  return { base, variants, defaultVariants };
}

/** Fixe Basis-Klassen aus einer NICHT-cva-Komponente (shadcn Input/Label ohne Varianten):
 *  bevorzugt das erste String-Argument eines `cn("…", className)`, sonst ein direktes
 *  className="…"/{`…`}. Leer, wenn nichts Passendes. Ergänzt parseCva (das für solche
 *  Komponenten base:'' liefert) → buildCatalogFromRepo kann so auch sie rendern. */
export function extractBase(source) {
  if (typeof source !== 'string') return '';
  const cnIdx = source.indexOf('cn(');
  if (cnIdx !== -1) {
    const open = cnIdx + 2; // Index des '(' hinter "cn"
    const end = matchBracket(source, open);
    if (end !== -1) {
      const first = splitTopLevel(source.slice(open + 1, end))[0] || '';
      const s = readStringValue(first);
      if (s) return s;
    }
  }
  const m = source.match(/className=\{?[`"']([^`"']*)[`"']/);
  return m ? m[1].trim() : '';
}

/** Nur die Achsen+Optionsnamen — Format wie der Katalog (`{ variant: [...], size: [...] }`),
 *  fürs Grounding-Vokabular und den Katalog-`variants`-Slot. */
export function variantAxes(parsed) {
  const out = {};
  for (const [axis, opts] of Object.entries(parsed?.variants || {})) {
    out[axis] = Object.keys(opts);
  }
  return out;
}
