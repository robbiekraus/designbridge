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
    });
  }

  const searches = els.filter(
    (el) => (el.tagName === 'INPUT' && typeOf(el) === 'search') || roleOf(el) === 'search'
  );
  if (searches.length) out.push({ name: 'Suche', variants: [], confidence: 'high', source: 'rules', notes: '' });

  const inputs = els.filter(
    (el) =>
      (el.tagName === 'INPUT' && typeOf(el) !== 'search') ||
      el.tagName === 'TEXTAREA' ||
      el.tagName === 'SELECT'
  );
  if (inputs.length) out.push({ name: 'Input', variants: [], confidence: 'high', source: 'rules', notes: '' });

  const badges = els.filter((el) => /badge|chip|\btag\b/.test(classOf(el)));
  if (badges.length) out.push({ name: 'Badge', variants: [], confidence: 'low', source: 'rules', notes: '' });

  return out;
}

function recognizePatterns(els) {
  const out = [];
  const add = (pred, name, note) => {
    if (els.some(pred)) out.push({ name, variants: [], confidence: 'med', source: 'rules', notes: note });
  };
  add((el) => el.tagName === 'NAV' || roleOf(el) === 'navigation', 'Navbar', 'aus <nav>-Landmarke');
  add((el) => el.tagName === 'HEADER' || roleOf(el) === 'banner', 'Hero', 'aus <header>-Landmarke');
  add((el) => el.tagName === 'FOOTER' || roleOf(el) === 'contentinfo', 'Footer', 'aus <footer>-Landmarke');
  add((el) => el.tagName === 'ASIDE' || roleOf(el) === 'complementary', 'Sidebar', 'aus <aside>-Landmarke');
  return out;
}

export function recognizeComponents(html, css) {
  const root = parse(html || '');
  const els = [];
  walk(root, (el) => els.push(el));
  return {
    atomics: recognizeAtomics(els),
    components: [],
    patterns: recognizePatterns(els),
  };
}
