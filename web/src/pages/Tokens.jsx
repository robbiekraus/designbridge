// web/src/pages/Tokens.jsx
import React from 'react';
import { ColorSwatch, TypographyRow, SpacingRow, RadiusRow, ShadowRow } from '../components/library/tokenViews.jsx';

function Section({ title, children }) {
  return (
    <section className="mb-8">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">{title}</h2>
      {children}
    </section>
  );
}

// Leitet aus den erkannten Schriftgrößen eine klassische Hierarchie ab
// (größenbasiert, nicht semantisch): größte -> H1, ~16px -> Body, kleinere -> Caption.
function assignHierarchy(typography) {
  const sizeOf = (t) => Number(t.size) || 0;
  let bodyIdx = 0, bodyDelta = Infinity;
  typography.forEach((t, i) => {
    const d = Math.abs(sizeOf(t) - 16);
    if (d < bodyDelta) { bodyDelta = d; bodyIdx = i; }
  });
  const bodySize = sizeOf(typography[bodyIdx]);
  const headings = typography
    .map((t, i) => ({ i, size: sizeOf(t) }))
    .filter((e) => e.size > bodySize)
    .sort((a, b) => b.size - a.size);
  const smalls = typography
    .map((t, i) => ({ i, size: sizeOf(t) }))
    .filter((e) => e.size < bodySize)
    .sort((a, b) => b.size - a.size);
  const labels = {};
  const headNames = ['Display', 'Heading', 'Subheading', 'Title'];
  headings.forEach((e, k) => { labels[e.i] = headNames[k] || 'Heading'; });
  labels[bodyIdx] = 'Copy';
  const smallNames = ['Caption', 'Small', 'XSmall'];
  smalls.forEach((e, k) => { labels[e.i] = smallNames[k] || 'Small'; });
  return typography.map((_, i) => labels[i] || 'Text');
}

export default function Tokens({ result }) {
  if (!result?.raw) {
    return <div className="text-sm text-zinc-500">Preview-Import — keine Detaildaten. Importiere ein Bild, um echte Tokens zu sehen.</div>;
  }
  const t = result.raw.tokens ?? {};
  const colors = t.colors ?? [];
  const typography = t.typography ?? [];
  const spacing = t.spacing ?? [];
  const radius = t.border_radius ?? [];
  const shadows = t.shadows ?? [];
  const typoSorted = [...typography].sort((a, b) => (Number(b.size) || 0) - (Number(a.size) || 0));
  const typoLabels = assignHierarchy(typoSorted);

  return (
    <div className="max-w-3xl">
      {colors.length > 0 && (
        <Section title="Colors">
          <div className="grid grid-cols-6 gap-3">
            {colors.map((c, i) => <ColorSwatch key={i} color={c} />)}
          </div>
        </Section>
      )}
      {typography.length > 0 && (
        <Section title="Typography">
          <ul>{typoSorted.map((item, i) => <TypographyRow key={i} item={item} label={typoLabels[i]} />)}</ul>
        </Section>
      )}
      {(() => {
        const cols = [
          spacing.length > 0 && { title: 'Spacing', rows: spacing.map((item, i) => <SpacingRow key={i} item={item} />) },
          radius.length > 0 && { title: 'Border radius', rows: radius.map((item, i) => <RadiusRow key={i} item={item} />) },
          shadows.length > 0 && { title: 'Shadows', rows: shadows.map((item, i) => <ShadowRow key={i} item={item} />) },
        ].filter(Boolean);
        if (cols.length === 0) return null;
        return (
          <div className="grid gap-8 items-start" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0,1fr))` }}>
            {cols.map((col, ci) => (
              <div key={col.title} className={ci > 0 ? 'border-l border-zinc-200 pl-8' : ''}>
                <Section title={col.title}><ul>{col.rows}</ul></Section>
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
