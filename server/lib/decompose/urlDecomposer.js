// UrlDecomposer: löst die vom Scan gelieferten selector-Pfade im DOM auf und
// füllt Segment.structure mit dem echten Markup + relevantem CSS-Digest.
// Erfüllt das Decomposer-Interface: decompose(source, inventory) -> Segment[]
import { parse } from 'node-html-parser';

const HTML_CAP = 8000;
const CSS_CAP = 4000;

// Löst nur die selbst erzeugten Pfade auf (tag / tag:nth-of-type(n), ' > '-getrennt).
function resolveSelector(root, selector) {
  let node = root;
  for (const part of String(selector || '').split('>').map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^([a-z0-9]+)(?::nth-of-type\((\d+)\))?$/i);
    if (!m || !node) return null;
    const [, tag, nth] = m;
    const kids = (node.childNodes || []).filter(
      (c) => c.nodeType === 1 && c.tagName && c.tagName.toLowerCase() === tag.toLowerCase()
    );
    node = nth ? kids[Number(nth) - 1] : kids[0];
    if (!node) return null;
  }
  return node === root ? null : node;
}

function walk(node, fn) {
  if (!node) return;
  if (node.nodeType === 1) fn(node);
  for (const c of node.childNodes || []) walk(c, fn);
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Bekannte Grenze: das Brace-Matching unten ist eine naive Heuristik —
// @media-/verschachtelte Blöcke und String-Literale mit Braces werden
// mis-geparst (kein Crash, nur verlustbehaftet). Für den Digest-Zweck ok.
function cssDigest(css, el) {
  const classes = new Set();
  const tags = new Set();
  walk(el, (n) => {
    if (n.tagName) tags.add(n.tagName.toLowerCase());
    for (const c of (n.getAttribute('class') || '').split(/\s+/).filter(Boolean)) classes.add(c);
  });
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const sel = m[1].trim();
    const hitClass = [...classes].some((c) =>
      new RegExp(`\\.${escapeRegExp(c)}(?![\\w-])`).test(sel)
    );
    const hitTag = [...tags].some((t) =>
      new RegExp(`(^|[\\s,>+~])${escapeRegExp(t)}([.:#\\s,>+~[]|$)`).test(sel)
    );
    if (hitClass || hitTag) out.push(`${sel}{${m[2].trim()}}`);
  }
  return out.join('\n').slice(0, CSS_CAP);
}

export const urlDecomposer = {
  async decompose({ html, css }, inventory) {
    const root = parse(html || '');
    // Vollseiten-Fallback bei Selector-Miss (Spec-Parität zum Bild-Vollbild):
    // lieber ganze Seite als gar kein Grounding. Lazy, einmal pro Aufruf.
    let fullPage = null;
    const fullPageStructure = () =>
      (fullPage ??= {
        html: (root.outerHTML || html || '').slice(0, HTML_CAP),
        css: String(css || '').slice(0, CSS_CAP),
      });
    return inventory.map((item, i) => {
      const el = item.selector ? resolveSelector(root, item.selector) : null;
      const structure = el
        ? { html: (el.outerHTML || '').slice(0, HTML_CAP), css: cssDigest(css || '', el) }
        : fullPageStructure();
      return {
        id: `seg_${i}`,
        label: item.name,
        kind: item.kind ?? 'component',
        confidence: item.confidence,
        notes: item.notes ?? '',
        bounds: el ? { selector: item.selector } : null,
        visual: null,
        structure,
      };
    });
  },
};
