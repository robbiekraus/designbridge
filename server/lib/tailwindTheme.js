const COMPUTED_WARNING =
  'Berechnete Werte in tailwind.config konnten statisch nicht gelesen werden.';
const UNREADABLE_WARNING =
  'tailwind.config konnte nicht vollständig gelesen werden.';

const SECTIONS = [
  ['colors', 'colors'],
  ['spacing', 'spacing'],
  ['borderRadius', 'radius'],
  ['boxShadow', 'shadows'],
  ['fontSize', 'fontSize'],
];

// //- und /*…*/-Kommentare String-bewusst durch Leerzeichen ersetzen (Zeilenumbrüche
// bleiben erhalten, damit keine Tokens verschmelzen und Offsets zeilenstabil bleiben).
// Ein Apostroph in "// don't edit" würde sonst den String-Status der Scanner kippen.
function stripComments(src) {
  let out = '';
  let inStr = null;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      out += ch;
      if (ch === '\\') out += src[++i] ?? '';
      else if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { inStr = ch; out += ch; continue; }
    if (ch === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') { out += ' '; i++; }
      if (i < src.length) out += '\n';
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      out += '  ';
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' ';
        i++;
      }
      if (i < src.length) { out += '  '; i++; } // schließendes */ konsumieren
      continue;
    }
    out += ch;
  }
  return out;
}

// Balancierte {…}-Klammer ab startIdx ausschneiden (String-bewusst).
function readBalanced(src, startIdx) {
  let depth = 0;
  let inStr = null;
  for (let i = startIdx; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (ch === '\\') i++;
      else if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { inStr = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(startIdx, i + 1);
    }
  }
  return null;
}

function findObjectStart(src, key) {
  const re = new RegExp(`(?:^|[\\s{,])${key}\\s*:\\s*\\{`);
  const m = re.exec(src);
  if (!m) return -1;
  return src.indexOf('{', m.index + m[0].length - 1);
}

export function extractObjectSource(src, key) {
  const start = findObjectStart(src, key);
  if (start < 0) return null;
  return readBalanced(src, start);
}

// Top-Level-Kommas splitten (Klammern & Strings respektieren).
function splitTopLevel(inner) {
  const parts = [];
  let depth = 0;
  let inStr = null;
  let cur = '';
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (inStr) {
      cur += ch;
      if (ch === '\\') { cur += inner[++i] ?? ''; }
      else if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { inStr = ch; cur += ch; continue; }
    if ('{[('.includes(ch)) depth++;
    if ('}])'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

function literalValue(v) {
  const s = /^(?:'([^'\n]*)'|"([^"\n]*)")$/.exec(v);
  if (s) return s[1] ?? s[2];
  if (/^-?[\d.]+$/.test(v)) return v;
  return null;
}

function parseEntries(objSrc, warnings, prefix = '', allowNesting = true) {
  const out = [];
  for (const part of splitTopLevel(objSrc.slice(1, -1))) {
    if (!part.trim()) continue;
    const m = /^\s*(?:'([^']+)'|"([^"]+)"|([\w.-]+))\s*:\s*([\s\S]+?)\s*$/.exec(part);
    if (!m) {
      warnings.add(COMPUTED_WARNING); // Spread, Kommentar-Reste, Unlesbares
      continue;
    }
    const key = m[1] ?? m[2] ?? m[3];
    const value = m[4];
    const lit = literalValue(value);
    if (lit !== null) { out.push({ name: prefix + key, value: lit }); continue; }
    if (value.startsWith('{') && allowNesting) {
      const nested = readBalanced(value, 0);
      if (nested) out.push(...parseEntries(nested, warnings, `${prefix}${key}-`, false));
      continue;
    }
    if (value.startsWith('[')) {
      const first = /['"]([^'"]+)['"]/.exec(value);
      if (first) { out.push({ name: prefix + key, value: first[1] }); continue; }
    }
    warnings.add(COMPUTED_WARNING); // require(), Funktionsaufruf, `${…}`, …
  }
  return out;
}

// Abweichung vom Plan: Der gesamte theme-Block wird zusätzlich rekursiv auf berechnete
// Werte gescannt (nur Warnungen, keine Einträge) — sonst warnt z. B. width: { logo: calcWidth() }
// in einer nicht gelesenen Sektion nie.
function scanComputed(objSrc, warnings, depth = 0) {
  if (depth > 6) return;
  for (const part of splitTopLevel(objSrc.slice(1, -1))) {
    if (!part.trim()) continue;
    const m = /^\s*(?:'([^']+)'|"([^"]+)"|([\w.-]+))\s*:\s*([\s\S]+?)\s*$/.exec(part);
    if (!m) {
      warnings.add(COMPUTED_WARNING);
      continue;
    }
    const value = m[4];
    if (literalValue(value) !== null) continue;
    if (value.startsWith('{')) {
      const nested = readBalanced(value, 0);
      if (nested) scanComputed(nested, warnings, depth + 1);
      else warnings.add(COMPUTED_WARNING);
      continue;
    }
    if (value.startsWith('[') && /['"]([^'"]+)['"]/.test(value)) continue;
    warnings.add(COMPUTED_WARNING);
  }
}

export function parseTailwindTheme(configSource) {
  const warnings = new Set();
  const entries = { colors: [], spacing: [], radius: [], shadows: [], fontSize: [] };
  const src = stripComments(configSource || '');
  const themeStart = findObjectStart(src, 'theme');
  if (themeStart < 0) return { entries, warnings: [] }; // kein theme-Block: sauberes Leerergebnis
  const themeSrc = readBalanced(src, themeStart);
  if (!themeSrc) {
    // theme: { … existiert, ließ sich aber nicht balancieren → sichtbar machen statt No-op
    return { entries, warnings: [UNREADABLE_WARNING] };
  }

  scanComputed(themeSrc, warnings);
  const extendSrc = extractObjectSource(themeSrc, 'extend');
  const scopes = [
    // extend-Block aus theme herausschneiden, sonst würden extend-Sektionen doppelt gelesen
    { src: extendSrc ? themeSrc.replace(extendSrc, '{}') : themeSrc, label: 'theme' },
    ...(extendSrc ? [{ src: extendSrc, label: 'theme.extend' }] : []),
  ];

  for (const { src, label } of scopes) {
    for (const [section, cat] of SECTIONS) {
      const objSrc = extractObjectSource(src, section);
      if (!objSrc) continue;
      for (const e of parseEntries(objSrc, warnings)) {
        entries[cat].push({ ...e, path: `${label}.${section}.${e.name}` });
      }
    }
  }
  return { entries, warnings: [...warnings] };
}
