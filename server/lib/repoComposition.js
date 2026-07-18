// Liest die echte Verschachtelung aus dem Repo-Code (statische JSX-Nutzung importierter
// Komponenten). Rein, deterministisch. Vertrag: raw.composition (children/roots).
// Spec: 2026-07-18-repo-composition-extraction-design.md.

import { pascal } from './repoInventory.js';

function baseIdent(path) {
  const base = String(path || '').split('/').pop() || '';
  return base.replace(/\.(t|j)sx?$/, '');
}

// importierte Bezeichner einer Datei (default + named), grob per Regex.
function importedIdents(src) {
  const set = new Set();
  const re = /import\s+([^;]+?)\s+from\s+['"][^'"]+['"]/g;
  let m;
  while ((m = re.exec(src))) {
    const clause = m[1];
    const def = clause.match(/^\s*([A-Za-z_$][\w$]*)/);
    if (def && /^[A-Z]/.test(def[1])) set.add(def[1]);
    const named = clause.match(/\{([^}]*)\}/);
    if (named) {
      for (const part of named[1].split(',')) {
        const id = part.trim().split(/\s+as\s+/).pop().trim();
        if (/^[A-Z][\w$]*$/.test(id)) set.add(id);
      }
    }
  }
  return set;
}

// JSX-Verwendungen (<Ident ...) mit Groß-Anfang.
function jsxUsages(src) {
  const order = [];
  const seen = new Set();
  const re = /<([A-Z][\w$]*)[\s/>]/g;
  let m;
  while ((m = re.exec(src))) {
    if (!seen.has(m[1])) { seen.add(m[1]); order.push(m[1]); }
  }
  return order;
}

export function buildRepoComposition(items, files) {
  // Bezeichner → Baustein-Name; mehrdeutige verwerfen.
  const identToNames = new Map();
  const addIdent = (id, name) => {
    if (!id) return;
    if (!identToNames.has(id)) identToNames.set(id, []);
    const list = identToNames.get(id);
    if (!list.includes(name)) list.push(name);
  };
  for (const it of items) {
    const raw = baseIdent(it.path);
    addIdent(raw, it.name);
    // Kebab-/snake-case Dateinamen (z. B. 'site-header.tsx') werden in JSX als
    // PascalCase importiert/gerendert ('<SiteHeader/>') — siehe repoInventory.js `pascal()`,
    // das denselben Namen für die Baustein-Bezeichnung nutzt. Beide Formen indexieren.
    addIdent(pascal(raw), it.name);
  }
  const identToName = new Map();
  for (const [id, names] of identToNames) {
    if (names.length === 1) identToName.set(id, names[0]);
  }

  // Direkte JSX-Kanten (nur importierte, eindeutige Bezeichner).
  const rawChildren = {}; // name -> [childName in order]
  for (const it of items) {
    const src = files[it.path] || '';
    const imported = importedIdents(src);
    const kids = [];
    for (const id of jsxUsages(src)) {
      if (!imported.has(id)) continue;
      const childName = identToName.get(id);
      if (!childName || childName === it.name) continue;
      if (!kids.includes(childName)) kids.push(childName);
    }
    if (kids.length) rawChildren[it.name] = kids;
  }

  // Transitive Reduktion: Kante A->C entfernen, wenn A->B und B ~> C (erreichbar).
  const reachable = (start, target) => {
    const stack = [...(rawChildren[start] || [])];
    const seen = new Set();
    while (stack.length) {
      const n = stack.pop();
      if (n === target) return true;
      if (seen.has(n)) continue;
      seen.add(n);
      stack.push(...(rawChildren[n] || []));
    }
    return false;
  };
  const children = {};
  for (const [parent, kids] of Object.entries(rawChildren)) {
    const direct = kids.filter((c) =>
      !kids.some((other) => other !== c && reachable(other, c)));
    if (direct.length) children[parent] = direct;
  }

  const hasParent = new Set();
  for (const kids of Object.values(children)) for (const c of kids) hasParent.add(c);
  const roots = items.map((it) => it.name).filter((n) => !hasParent.has(n));
  return { children, roots };
}
