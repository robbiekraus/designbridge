// Default-Katalog (Scheibe 1, Spec 2026-07-23-slice1-ds-grounding-default-catalog-design.md).
//
// Das mitgelieferte shadcn/ui + Tailwind-Vokabular, gegen das ein Scan gegroundet wird, wenn der
// User kein eigenes Design System reinreicht. KEIN cva-Parsing (das ist Scheibe 2 für fremde Repos) —
// hier ein kuratierter, von Hand gepflegter Startsatz.
//
// Jeder Eintrag trägt:
//   name      — Katalog-Identität (== Komponentenname im Emit)
//   import    — { name, from }, der echte Import fürs Code-Emit (planToJsx, Schritt 3)
//   variants  — erlaubte Varianten-Achsen (variant/size/…) als Optionslisten
//   props     — im Bild realistisch erkennbare Props (klein gehalten)
//   match     — Erkennungs-Signale fürs Grounding (Schritt 2/4)
//   plan(sel) — kanonischer, TOKEN-referenzierter plan je Varianten-Auswahl (Rendering, Q3).
//               Reine Funktion, Defaults eingebaut → plan() ohne Argument liefert den Default-Zustand.
//
// Plan-Format identisch zu den Templates (planHelpers.js):
//   box  = { type:'box', layout:'row'|'column', padding:[t,r,b,l], radius, fill, stroke, children }
//   text = { type:'text', content, fontSize, fontWeight, color:{token,hex} }
//   svg  = { type:'svg', markup }
//   ColorRef = { token, hex } — im Default-Katalog IMMER mit token (shadcn CSS-Variablen-Name).

// shadcn/ui Default-Theme (new-york / zinc). token-Name = shadcn-CSS-Variable, hex = zinc-Standardwert.
const THEME = {
  background: '#ffffff',
  foreground: '#09090b',
  primary: '#18181b',
  'primary-foreground': '#fafafa',
  secondary: '#f4f4f5',
  'secondary-foreground': '#18181b',
  muted: '#f4f4f5',
  'muted-foreground': '#71717a',
  accent: '#f4f4f5',
  'accent-foreground': '#18181b',
  destructive: '#ef4444',
  'destructive-foreground': '#fafafa',
  border: '#e4e4e7',
  input: '#e4e4e7',
  ring: '#18181b',
  card: '#ffffff',
  'card-foreground': '#09090b',
};

const ref = (token) => ({ token, hex: THEME[token] });

const box = (o = {}) => ({
  type: 'box', layout: 'row', padding: [0, 0, 0, 0], radius: 0,
  fill: null, stroke: null, children: [], ...o,
});
const text = (content, { size = 14, weight = 400, color = 'foreground' } = {}) => ({
  type: 'text', content, fontSize: size, fontWeight: weight, color: ref(color),
});
const svg = (markup) => ({ type: 'svg', markup });

// --- Button --------------------------------------------------------------
// shadcn: text-sm (14) font-medium (500), rounded-md (6). Größen h-10/9/11/10.
const BUTTON_PADDING = { default: [8, 16, 8, 16], sm: [6, 12, 6, 12], lg: [12, 32, 12, 32], icon: [10, 10, 10, 10] };

function buttonPlan({ variant = 'default', size = 'default' } = {}) {
  const padding = BUTTON_PADDING[size] ?? BUTTON_PADDING.default;
  const base = box({ layout: 'row', padding, radius: 6 });
  // Icon-Größe: quadratisch, Glyph statt Text-Label (analog buttonTemplate).
  if (size === 'icon') {
    const stroke = variant === 'default' ? THEME['primary-foreground'] : THEME.foreground;
    const icon = svg(`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>`);
    if (variant === 'default') return { ...base, fill: ref('primary'), children: [icon] };
    if (variant === 'outline') return { ...base, stroke: ref('input'), children: [icon] };
    return { ...base, children: [icon] };
  }
  const label = (color) => text('Button', { size: 14, weight: 500, color });
  switch (variant) {
    case 'secondary':
      return { ...base, fill: ref('secondary'), children: [label('secondary-foreground')] };
    case 'destructive':
      return { ...base, fill: ref('destructive'), children: [label('destructive-foreground')] };
    case 'outline':
      return { ...base, stroke: ref('input'), children: [label('foreground')] };
    case 'ghost':
      return { ...base, children: [label('foreground')] };
    case 'link':
      return { ...base, children: [label('primary')] };
    default:
      return { ...base, fill: ref('primary'), children: [label('primary-foreground')] };
  }
}

// --- Input ---------------------------------------------------------------
// shadcn: h-10 w-full px-3 py-2, text-sm, rounded-md, border border-input, bg-background.
function inputPlan() {
  return box({
    layout: 'row', padding: [8, 12, 8, 12], radius: 6,
    fill: ref('background'), stroke: ref('input'),
    children: [text('Eingabe', { size: 14, weight: 400, color: 'muted-foreground' })],
  });
}

// --- Label ---------------------------------------------------------------
// shadcn: text-sm font-medium.
function labelPlan() {
  return text('Label', { size: 14, weight: 500, color: 'foreground' });
}

// --- Badge ---------------------------------------------------------------
// shadcn: px-2.5 py-0.5, rounded-full, text-xs (12) font-semibold (600).
function badgePlan({ variant = 'default' } = {}) {
  const base = box({ layout: 'row', padding: [2, 10, 2, 10], radius: 9999 });
  const label = (color) => text('Badge', { size: 12, weight: 600, color });
  switch (variant) {
    case 'secondary':
      return { ...base, fill: ref('secondary'), children: [label('secondary-foreground')] };
    case 'destructive':
      return { ...base, fill: ref('destructive'), children: [label('destructive-foreground')] };
    case 'outline':
      return { ...base, stroke: ref('border'), children: [label('foreground')] };
    default:
      return { ...base, fill: ref('primary'), children: [label('primary-foreground')] };
  }
}

// --- Card ----------------------------------------------------------------
// shadcn: rounded-lg (8) border bg-card. Header p-6 (Titel text-2xl font-semibold), Content p-6 pt-0.
function cardPlan() {
  return box({
    layout: 'column', padding: [24, 24, 24, 24], radius: 8,
    fill: ref('card'), stroke: ref('border'),
    children: [
      text('Card-Titel', { size: 24, weight: 600, color: 'card-foreground' }),
      text('Card-Inhalt', { size: 14, weight: 400, color: 'muted-foreground' }),
    ],
  });
}

// --- Checkbox ------------------------------------------------------------
// shadcn: h-4 w-4 (16), rounded-sm (4), border border-primary. checked → bg-primary + Häkchen.
function checkboxPlan({ checked = false } = {}) {
  const base = box({ layout: 'row', padding: [0, 0, 0, 0], radius: 4, stroke: ref('primary') });
  if (!checked) return base;
  const tick = svg(`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${THEME['primary-foreground']}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`);
  return { ...base, fill: ref('primary'), children: [tick] };
}

// --- Avatar --------------------------------------------------------------
// shadcn: h-10 w-10 (40), rounded-full, bg-muted, Fallback-Initialen zentriert.
function avatarPlan() {
  return box({
    layout: 'row', padding: [0, 0, 0, 0], radius: 9999, fill: ref('muted'),
    children: [text('AB', { size: 14, weight: 500, color: 'muted-foreground' })],
  });
}

// --- Separator -----------------------------------------------------------
// shadcn: horizontal h-px w-full bg-border.
function separatorPlan() {
  return box({ layout: 'row', padding: [0, 0, 0, 0], radius: 0, fill: ref('border') });
}

export const SHADCN_DEFAULT_CATALOG = [
  {
    name: 'Button',
    import: { name: 'Button', from: '@/components/ui/button' },
    variants: { variant: ['default', 'secondary', 'destructive', 'outline', 'ghost', 'link'], size: ['default', 'sm', 'lg', 'icon'] },
    props: ['disabled'],
    match: { tag: 'button', hints: ['button', 'btn', 'cta'] },
    plan: buttonPlan,
  },
  {
    name: 'Input',
    import: { name: 'Input', from: '@/components/ui/input' },
    variants: {},
    props: ['disabled', 'placeholder'],
    match: { tag: 'input', hints: ['input', 'field', 'textfield'] },
    plan: inputPlan,
  },
  {
    name: 'Label',
    import: { name: 'Label', from: '@/components/ui/label' },
    variants: {},
    props: [],
    match: { tag: 'label', hints: ['label'] },
    plan: labelPlan,
  },
  {
    name: 'Badge',
    import: { name: 'Badge', from: '@/components/ui/badge' },
    variants: { variant: ['default', 'secondary', 'destructive', 'outline'] },
    props: [],
    match: { tag: 'span', hints: ['badge', 'tag', 'chip', 'status', 'pill'] },
    plan: badgePlan,
  },
  {
    name: 'Card',
    import: { name: 'Card', from: '@/components/ui/card' },
    variants: {},
    props: [],
    match: { tag: 'div', hints: ['card', 'panel', 'tile'] },
    plan: cardPlan,
  },
  {
    name: 'Checkbox',
    import: { name: 'Checkbox', from: '@/components/ui/checkbox' },
    variants: {},
    props: ['checked', 'disabled'],
    match: { tag: 'input', hints: ['checkbox', 'check'] },
    plan: checkboxPlan,
  },
  {
    name: 'Avatar',
    import: { name: 'Avatar', from: '@/components/ui/avatar' },
    variants: {},
    props: [],
    match: { tag: 'div', hints: ['avatar', 'profile', 'user-pic'] },
    plan: avatarPlan,
  },
  {
    name: 'Separator',
    import: { name: 'Separator', from: '@/components/ui/separator' },
    variants: {},
    props: ['orientation'],
    match: { tag: 'hr', hints: ['separator', 'divider', 'rule'] },
    plan: separatorPlan,
  },
];

// Fertige htmlToPlan-Option (Scheibe 1 Schritt 4): source + components in der Form, die htmlToPlan
// erwartet. Emit-Aufrufer (emitComponents/emitFigmaComponents) reichen das an htmlToPlan durch, damit
// data-ds-*-Marker zu Katalog-component-refs werden.
export const SHADCN_DEFAULT_CATALOG_OPTION = { source: 'shadcn-default', components: SHADCN_DEFAULT_CATALOG };

const BY_NAME = new Map(SHADCN_DEFAULT_CATALOG.map((c) => [c.name, c]));

/** Katalog-Eintrag per Name (== Katalog-Identität), oder undefined. */
export function getCatalogComponent(name) {
  return BY_NAME.get(name);
}

/** Alle Katalog-Namen (Vokabular fürs Grounding, Schritt 2/4). */
export function catalogComponentNames() {
  return SHADCN_DEFAULT_CATALOG.map((c) => c.name);
}
