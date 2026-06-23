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

  return (
    <div className="max-w-3xl">
      {colors.length > 0 && (
        <Section title="Colors">
          <div className="grid grid-cols-4 gap-3">
            {colors.map((c, i) => <ColorSwatch key={i} color={c} />)}
          </div>
        </Section>
      )}
      {typography.length > 0 && (
        <Section title="Typography">
          <ul>{typography.map((item, i) => <TypographyRow key={i} item={item} />)}</ul>
        </Section>
      )}
      {spacing.length > 0 && (
        <Section title="Spacing">
          <ul>{spacing.map((item, i) => <SpacingRow key={i} item={item} />)}</ul>
        </Section>
      )}
      {radius.length > 0 && (
        <Section title="Border radius">
          <ul>{radius.map((item, i) => <RadiusRow key={i} item={item} />)}</ul>
        </Section>
      )}
      {shadows.length > 0 && (
        <Section title="Shadows">
          <ul>{shadows.map((item, i) => <ShadowRow key={i} item={item} />)}</ul>
        </Section>
      )}
    </div>
  );
}
