import { parse } from 'node-html-parser';

const VARIANT_WORDS = ['primary', 'secondary', 'ghost', 'outline', 'danger', 'link'];

function walk(node, fn) {
  if (!node) return;
  if (node.nodeType === 1) fn(node);
  for (const c of node.childNodes || []) walk(c, fn);
}

const classOf = (el) => (el.getAttribute('class') || '').toLowerCase();
const roleOf = (el) => (el.getAttribute('role') || '').toLowerCase();
const typeOf = (el) => (el.getAttribute('type') || '').toLowerCase();

// Pfad von der Wurzel zum Element — nur tag + :nth-of-type, damit Scheibe ②
// ihn ohne querySelector deterministisch auflösen kann.
function cssPath(el) {
  const parts = [];
  let node = el;
  while (node && node.nodeType === 1 && node.tagName) {
    const tag = node.tagName.toLowerCase();
    const parent = node.parentNode;
    const siblings = parent
      ? (parent.childNodes || []).filter((c) => c.nodeType === 1 && c.tagName === node.tagName)
      : [node];
    const idx = siblings.indexOf(node) + 1;
    parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${idx})` : tag);
    node = parent;
  }
  return parts.join(' > ');
}

const LAYOUT_CLASS = /container|wrapper|row|col|grid|flex|inner|content|main|page|layout|section/;
// Exakter Klassenname (nicht Substring!) einer bereits bekannten Kategorie.
// "card" allein zaehlt als bekannt, "stat-card" nicht — sonst wuerden zusammengesetzte
// Klassennamen wie "stat-card" faelschlich als bekannt gelten und nie zum Kandidaten.
const KNOWN_CLASS_WORDS = new Set(['btn', 'button', 'badge', 'chip', 'tag', 'card', 'tile']);
// Tailwind-/Utility-Klassen sind Styling, keine Bausteine — ohne diesen Filter
// fluten sie die Kandidatenliste (items-center, py-4, …) und verbrauchen das
// 5er-Limit, bevor echte unbenannte Bausteine (stat-card) drankommen.
const UTILITY_CLASS = new RegExp(
  '[:\\[\\]/]|^-|^(?:' +
    '(?:p|m)(?:[trblxyse])?-|' +
    '(?:w|h|min-w|min-h|max-w|max-h|size|basis|order|z|inset|top|right|bottom|left)-|' +
    '(?:text|font|bg|border|rounded|shadow|ring|outline|fill|stroke|divide|space|gap)(?:-|$)|' +
    '(?:items|justify|self|place|object|overflow|align|leading|tracking|whitespace|break|list|aspect|columns)-|' +
    '(?:transition|duration|delay|ease|animate|opacity|cursor|select|grow|shrink|truncate|uppercase|lowercase|capitalize|italic|underline)(?:-|$)|' +
    '(?:absolute|relative|fixed|sticky|static|hidden|block|inline|inline-block|inline-flex|table)$' +
  ')'
);
const titleCase = (cls) =>
  cls.split(/[-_]/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

function recognizeCandidates(els) {
  const CONTAINER = new Set(['DIV', 'SECTION', 'ARTICLE']);
  const byClass = new Map();
  for (const el of els) {
    if (!CONTAINER.has(el.tagName)) continue;
    const kids = (el.childNodes || []).filter((c) => c.nodeType === 1);
    if (kids.length < 2) continue;
    for (const c of classOf(el).split(/\s+/).filter(Boolean)) {
      if (!byClass.has(c)) byClass.set(c, []);
      byClass.get(c).push(el);
    }
  }
  const out = [];
  for (const [cls, list] of byClass) {
    if (list.length < 2 || LAYOUT_CLASS.test(cls) || KNOWN_CLASS_WORDS.has(cls) || UTILITY_CLASS.test(cls)) continue;
    out.push({
      name: titleCase(cls),
      variants: [],
      confidence: 'low',
      source: 'rules',
      notes: 'unerkannter Baustein-Kandidat',
      selector: cssPath(list[0]),
    });
    if (out.length >= 5) break;
  }
  return out;
}

function buttonVariants(buttons) {
  const found = new Set();
  for (const b of buttons) {
    const cls = classOf(b);
    for (const w of VARIANT_WORDS) if (cls.includes(w)) found.add(w);
  }
  return [...found].sort();
}

function recognizeAtomics(els) {
  const out = [];

  const buttons = els.filter(
    (el) =>
      el.tagName === 'BUTTON' ||
      roleOf(el) === 'button' ||
      (el.tagName === 'A' && /\bbtn\b|button/.test(classOf(el)))
  );
  if (buttons.length) {
    const solid = buttons.some((b) => b.tagName === 'BUTTON' || roleOf(b) === 'button');
    out.push({
      name: 'Button',
      variants: buttonVariants(buttons),
      confidence: solid ? 'high' : 'low',
      source: 'rules',
      notes: '',
      selector: cssPath(buttons[0]),
    });
  }

  const searches = els.filter(
    (el) => (el.tagName === 'INPUT' && typeOf(el) === 'search') || roleOf(el) === 'search'
  );
  if (searches.length)
    out.push({
      name: 'Suche',
      variants: [],
      confidence: 'high',
      source: 'rules',
      notes: '',
      selector: cssPath(searches[0]),
    });

  const inputs = els.filter(
    (el) =>
      (el.tagName === 'INPUT' && typeOf(el) !== 'search') ||
      el.tagName === 'TEXTAREA' ||
      el.tagName === 'SELECT'
  );
  if (inputs.length)
    out.push({
      name: 'Input',
      variants: [],
      confidence: 'high',
      source: 'rules',
      notes: '',
      selector: cssPath(inputs[0]),
    });

  const badges = els.filter((el) => /badge|chip|\btag\b/.test(classOf(el)));
  if (badges.length)
    out.push({
      name: 'Badge',
      variants: [],
      confidence: 'low',
      source: 'rules',
      notes: '',
      selector: cssPath(badges[0]),
    });

  return out;
}

function recognizePatterns(els) {
  const out = [];
  const add = (pred, name, note) => {
    const hit = els.find(pred);
    if (hit) out.push({ name, variants: [], confidence: 'med', source: 'rules', notes: note, selector: cssPath(hit) });
  };
  add((el) => el.tagName === 'NAV' || roleOf(el) === 'navigation', 'Navbar', 'aus <nav>-Landmarke');
  add((el) => el.tagName === 'HEADER' || roleOf(el) === 'banner', 'Hero', 'aus <header>-Landmarke');
  add((el) => el.tagName === 'FOOTER' || roleOf(el) === 'contentinfo', 'Footer', 'aus <footer>-Landmarke');
  add((el) => el.tagName === 'ASIDE' || roleOf(el) === 'complementary', 'Sidebar', 'aus <aside>-Landmarke');
  return out;
}

function recognizeComposed(els) {
  const out = [];

  const forms = els.filter(
    (el) => el.tagName === 'FORM' && el.querySelectorAll('input, textarea, select').length > 0
  );
  if (forms.length)
    out.push({
      name: 'Formular',
      variants: [],
      confidence: 'med',
      source: 'rules',
      notes: '',
      selector: cssPath(forms[0]),
    });

  if (els.some((el) => el.tagName === 'TABLE'))
    out.push({
      name: 'Tabelle',
      variants: [],
      confidence: 'med',
      source: 'rules',
      notes: '',
      selector: cssPath(els.find((el) => el.tagName === 'TABLE')),
    });

  const lists = els.filter(
    (el) => (el.tagName === 'UL' || el.tagName === 'OL') && el.querySelectorAll('li').length >= 3
  );
  if (lists.length)
    out.push({
      name: 'Liste',
      variants: [],
      confidence: 'med',
      source: 'rules',
      notes: '',
      selector: cssPath(lists[0]),
    });

  const classCounts = new Map();
  for (const el of els) {
    for (const c of classOf(el).split(/\s+/).filter(Boolean)) {
      classCounts.set(c, (classCounts.get(c) || 0) + 1);
    }
  }
  const card = [...classCounts.entries()].find(([c, n]) => /card|tile/.test(c) && n >= 2);
  if (card)
    out.push({
      name: 'Card',
      variants: [],
      confidence: 'low',
      source: 'rules',
      notes: '',
      selector: cssPath(els.find((el) => /card|tile/.test(classOf(el)))),
    });

  return out;
}

export function recognizeComponents(html) {
  try {
    const root = parse(typeof html === 'string' ? html : '');
    const els = [];
    walk(root, (el) => els.push(el));
    return {
      atomics: recognizeAtomics(els),
      components: [...recognizeComposed(els), ...recognizeCandidates(els)],
      patterns: recognizePatterns(els),
    };
  } catch {
    return { atomics: [], components: [], patterns: [] };
  }
}
