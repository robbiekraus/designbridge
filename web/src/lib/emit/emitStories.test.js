import { describe, it, expect } from 'vitest';
import { emitStories } from './emitStories.js';

const base = {
  name: 'Button',
  slug: 'button',
  filename: 'Button.jsx',
  kind: 'atom',
  variants: [],
  code: 'export function Button({ className = "", ...props }) {\n  return <button className={className} {...props} />;\n}\n',
  grounded: [],
};

describe('emitStories', () => {
  it('erzeugt Dateiname <Pascal>.stories.jsx', () => {
    expect(emitStories(base).filename).toBe('Button.stories.jsx');
  });

  it('CSF3: default export mit title aus kind-Gruppe + component-Name', () => {
    const { code } = emitStories(base);
    expect(code).toContain("title: 'Atoms/Button'");
    expect(code).toContain('component: Button');
    expect(code).toContain('export default {');
  });

  it('importiert den benannten Export aus ../components', () => {
    const { code } = emitStories(base);
    expect(code).toContain("import { Button } from '../components/Button'");
  });

  it('hat immer eine Default-Story', () => {
    expect(emitStories(base).code).toContain('export const Default = {};');
  });

  it('erzeugt je Variante eine benannte Story mit variant-arg', () => {
    const { code } = emitStories({ ...base, variants: ['primary', 'ghost'] });
    expect(code).toContain("export const Primary = { args: { variant: 'primary' } };");
    expect(code).toContain("export const Ghost = { args: { variant: 'ghost' } };");
  });

  it('gruppiert nach kind (molecule -> Molecules, organism -> Organisms, template -> Templates)', () => {
    expect(emitStories({ ...base, kind: 'molecule' }).code).toContain("title: 'Molecules/Button'");
    expect(emitStories({ ...base, kind: 'organism' }).code).toContain("title: 'Organisms/Button'");
    expect(emitStories({ ...base, kind: 'template' }).code).toContain("title: 'Templates/Button'");
  });

  it('setzt bei gegroundeten Bausteinen einen shadcn-Kommentar', () => {
    const { code } = emitStories({ ...base, grounded: ['Button', 'Badge'] });
    expect(code).toContain('// Rendert echte shadcn-Komponenten: Button, Badge');
  });

  it('liest Default-Export (gehobener Repo-Code mit fremdem Namen)', () => {
    const { code } = emitStories({
      ...base,
      name: 'Card Skeleton',
      slug: 'card-skeleton',
      filename: 'card-skeleton.jsx',
      code: 'export default function CardSkeleton() { return null; }\n',
    });
    expect(code).toContain("import CardSkeleton from '../components/card-skeleton'");
    expect(code).toContain('component: CardSkeleton');
    expect(code).toContain("title: 'Atoms/Card Skeleton'");
  });

  it('Varianten-Namen werden zu gültigen JS-Identifiern', () => {
    const { code } = emitStories({ ...base, variants: ['2xl', 'with icon'] });
    expect(code).toContain("export const V2xl = { args: { variant: '2xl' } };");
    expect(code).toContain("export const WithIcon = { args: { variant: 'with icon' } };");
  });
});
