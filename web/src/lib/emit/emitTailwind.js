const LOW = '// unsicher erkannt — bitte prüfen';

function entryLine(name, ref, low) {
  return `    '${name}': '${ref}',${low ? ` ${LOW}` : ''}`;
}

function block(key, entries) {
  return `  ${key}: {\n${entries.join('\n')}\n  },`;
}

export function emitTailwind(tokens) {
  const by = group => tokens.filter(t => t.group === group);
  const colors = by('color');
  const fonts = by('font');
  const spacing = by('spacing');
  const radius = by('radius');
  const shadows = by('shadow');

  const blocks = [];
  if (colors.length) {
    blocks.push(block('colors',
      colors.map(t => entryLine(t.name, `var(--color-${t.name})`, t.confidence === 'low'))));
  }
  if (fonts.length) {
    blocks.push(block('fontSize',
      fonts.map(t => entryLine(t.name, `var(--font-${t.name}-size)`, t.confidence === 'low'))));
    blocks.push(block('fontWeight',
      fonts.map(t => entryLine(t.name, `var(--font-${t.name}-weight)`, t.confidence === 'low'))));

  }
  if (spacing.length) {
    blocks.push(block('spacing',
      spacing.map(t => entryLine(t.name, `var(--spacing-${t.name})`, t.confidence === 'low'))));
  }
  if (radius.length) {
    blocks.push(block('borderRadius',
      radius.map(t => entryLine(t.name, `var(--radius-${t.name})`, t.confidence === 'low'))));
  }
  if (shadows.length) {
    blocks.push(block('boxShadow',
      shadows.map(t => entryLine(t.name, `var(--shadow-${t.name})`, t.confidence === 'low'))));
  }

  return [
    '// DesignBridge — generated Tailwind tokens',
    "// Usage: import tokens from './tokens/tailwind.config.tokens.js'",
    '//        export default { theme: { extend: tokens } }',
    'module.exports = {',
    blocks.join('\n'),
    '};',
    '',
  ].join('\n');
}
