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

// `gap`/`primaryAlign`/`counterAlign` MÜSSEN einen Default tragen (Bug 27.07., Sunstone-Scan
// „Shopping Cart Performance Card" / Molekül „Metric Funnel Progress Bar"): ohne sie blieben diese
// Felder bei jedem plan()-Aufruf, der sie nicht explizit setzt (progressPlan & Co.), `undefined` —
// htmlToPlan.js setzt sie über readGap/readAlignment IMMER (nie undefined), Katalog-Pläne waren die
// einzige Quelle für `box`-Knoten ohne diese Felder. Zwei Symptome, beide nur im Figma-Emit sichtbar
// (der Tailwind/JSX-Emit schützt sich defensiv, s. planToJsx.js layoutClasses/JUSTIFY_CLASS):
//   1. scalePlan.js skaliert `gap` ungeschützt (`Math.round(node.gap * factor)`) → bei jedem Scan mit
//      scanScale ≠ 1 (der Normalfall) wird `undefined * factor` zu `NaN` — bewiesen live gegen
//      Testdaten/sunstone-scan-27-07.json: das gegroundete Progress-Blatt in „Metric Funnel Progress
//      Bar" trägt nach dem Emit `gap: NaN`.
//   2. designbridge-plugin/src/writer/renderPlan.ts weist `plan.primaryAlign`/`plan.counterAlign`
//      ungeprüft `frame.primaryAxisAlignItems`/`frame.counterAxisAlignItems` zu — beide Figma-API-
//      Setter erwarten ein gültiges Enum-Mitglied, kein `undefined`.
// Defaults spiegeln exakt das, was ein CSS-Block ohne eigenes Flex/Gap in htmlToPlan.js bekäme
// (readGap → 0, readAlignment für Nicht-Flex → MIN/MIN) — überschreibbar wie bisher über `...o`.
const box = (o = {}) => ({
  type: 'box', layout: 'row', padding: [0, 0, 0, 0], radius: 0,
  fill: null, stroke: null, gap: 0, primaryAlign: 'MIN', counterAlign: 'MIN', children: [], ...o,
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
  // Größe MUSS am Plan stehen (Fund in Robs Figma-Datei 26.07.): ein Box-Knoten ohne width/height
  // hat in Figma nichts zu huggen, wenn er auch keine Kinder hat → Figma setzt seine Default-Größe
  // 100×100. Genau so landete `DS/Checkbox` als 100×100-Kasten in der Bibliothek statt als 16×16.
  // Betrifft nur die Bibliotheks-Exemplare: gegroundete Bausteine holen ihre Maße aus der Messung
  // (groundContainer nimmt width/height vom fallback, nur fill/stroke/radius aus dem Katalog).
  const base = box({ layout: 'row', padding: [0, 0, 0, 0], radius: 4, stroke: ref('primary'), width: 16, height: 16 });
  if (!checked) return base;
  const tick = svg(`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${THEME['primary-foreground']}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`);
  return { ...base, fill: ref('primary'), children: [tick] };
}

// --- Avatar --------------------------------------------------------------
// shadcn: h-10 w-10 (40), rounded-full, bg-muted, Fallback-Initialen zentriert.
function avatarPlan() {
  // h-10 w-10 explizit (s. Begründung bei checkboxPlan): ohne Maße hugte der Avatar nur seine
  // Initialen und landete als 19×17 in der Bibliothek statt als 40×40-Kreis.
  return box({
    layout: 'row', padding: [0, 0, 0, 0], radius: 9999, fill: ref('muted'), width: 40, height: 40,
    primaryAlign: 'CENTER', counterAlign: 'CENTER',
    children: [text('AB', { size: 14, weight: 500, color: 'muted-foreground' })],
  });
}

// --- Separator -----------------------------------------------------------
// shadcn: horizontal h-px w-full bg-border.
function separatorPlan({ orientation = 'horizontal' } = {}) {
  // h-px: die Höhe ist die ganze Komponente. Ohne sie war `DS/Separator` ein 100×100-Kasten.
  // `w-full` hat für ein alleinstehendes Bibliotheks-Exemplar keine Bedeutung — 200px ist die
  // Musterlänge, damit man den Trenner überhaupt sieht. Im Scan gilt die gemessene Breite.
  return orientation === 'vertical'
    ? box({ layout: 'column', padding: [0, 0, 0, 0], radius: 0, fill: ref('border'), width: 1, height: 200 })
    : box({ layout: 'row', padding: [0, 0, 0, 0], radius: 0, fill: ref('border'), width: 200, height: 1 });
}

// =========================================================================
// Aufstockung 26.07.2026 (Robs Frage „wie wenig nimmst du eigentlich von shadcn?").
//
// Der Katalog ist nicht nur Render-Vorlage, sondern das VOKABULAR, mit dem die KI erkennen darf.
// Mit 8 Einträgen wurde alles andere als generischer Kasten nachgebaut — konkret in Robs Scan: der
// Day/Week/Month-Umschalter (eigentlich Tabs) landete als schwarzer Button, der Storage-Balken
// (Progress) und die Tabelle als handgebaute Frames.
//
// BEWUSST NICHT AUFGENOMMEN — Select, Table, DropdownMenu, Tooltip: deren Radix-Wurzel rendert
// NICHTS, solange die Pflicht-Unterkomponenten fehlen (SelectTrigger/SelectContent,
// DropdownMenuTrigger, TooltipTrigger). Ein gegroundeter Knoten bekommt seine Kinder aber aus der
// MESSUNG, nicht aus dem Katalog — `<Select><div>…</div></Select>` würde also im Code-Emit sichtbar
// leer werden, schlechter als der generische Kasten von heute. Bei `Table` käme zusätzlich `<div>`
// in `<table>`, also ungültiges HTML (React-Warnung). Diese vier brauchen zuerst den
// Sub-Komponenten-Slots-Mechanismus (Spec 2026-07-25-sub-komponenten-slots-design.md, Scheibe A
// deckt bisher nur Card→CardHeader/CardContent ab).
// Aufgenommen sind daher nur Komponenten, deren Wurzel als EIN Element sichtbar rendert.
// =========================================================================

// --- Tabs ----------------------------------------------------------------
// shadcn TabsList: h-10 rounded-md bg-muted p-1. Trigger aktiv: bg-background shadow-sm,
// text-sm (14) font-medium (500); inaktiv: text-muted-foreground.
function tabsPlan() {
  const trigger = (label, active) => box({
    layout: 'row', padding: [6, 12, 6, 12], radius: 4,
    fill: active ? ref('background') : null,
    primaryAlign: 'CENTER', counterAlign: 'CENTER',
    children: [text(label, { size: 14, weight: 500, color: active ? 'foreground' : 'muted-foreground' })],
  });
  return box({
    layout: 'row', padding: [4, 4, 4, 4], radius: 6, gap: 4, fill: ref('muted'),
    counterAlign: 'CENTER',
    children: [trigger('Day', true), trigger('Week', false), trigger('Month', false)],
  });
}

// --- ToggleGroup ---------------------------------------------------------
// shadcn: Items wie Button ghost/outline, rounded-md, text-sm font-medium.
function toggleGroupPlan({ variant = 'default' } = {}) {
  const outline = variant === 'outline';
  const item = (label, on) => box({
    layout: 'row', padding: [6, 12, 6, 12], radius: 6,
    fill: on ? ref('accent') : null,
    stroke: outline ? ref('border') : null,
    primaryAlign: 'CENTER', counterAlign: 'CENTER',
    children: [text(label, { size: 14, weight: 500, color: on ? 'accent-foreground' : 'muted-foreground' })],
  });
  return box({ layout: 'row', gap: 4, counterAlign: 'CENTER', children: [item('Links', true), item('Rechts', false)] });
}

// --- Progress ------------------------------------------------------------
// shadcn: h-2 w-full rounded-full bg-secondary, Indicator bg-primary.
function progressPlan({ value = 60 } = {}) {
  const width = 200;
  const filled = Math.max(1, Math.round((width * Math.min(100, Math.max(0, value))) / 100));
  return box({
    layout: 'row', radius: 9999, fill: ref('secondary'), width, height: 8,
    children: [box({ layout: 'row', radius: 9999, fill: ref('primary'), width: filled, height: 8 })],
  });
}

// --- Switch --------------------------------------------------------------
// shadcn: h-6 w-11 rounded-full (checked bg-primary, sonst bg-input), Thumb h-5 w-5 bg-background.
function switchPlan({ checked = false } = {}) {
  return box({
    layout: 'row', padding: [2, 2, 2, 2], radius: 9999, width: 44, height: 24,
    fill: checked ? ref('primary') : ref('input'),
    primaryAlign: checked ? 'MAX' : 'MIN', counterAlign: 'CENTER',
    children: [box({ layout: 'row', radius: 9999, fill: ref('background'), width: 20, height: 20 })],
  });
}

// --- Skeleton ------------------------------------------------------------
// shadcn: animate-pulse rounded-md bg-muted (die Animation hat in Figma keine Entsprechung).
function skeletonPlan() {
  return box({ layout: 'row', radius: 6, fill: ref('muted'), width: 200, height: 16 });
}

// --- Textarea ------------------------------------------------------------
// shadcn: min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm.
function textareaPlan() {
  return box({
    layout: 'column', padding: [8, 12, 8, 12], radius: 6, stroke: ref('input'),
    fill: ref('background'), width: 320, height: 80,
  });
}

// --- Alert ---------------------------------------------------------------
// shadcn: rounded-lg border p-4, Titel font-medium, Beschreibung text-sm text-muted-foreground.
function alertPlan({ variant = 'default' } = {}) {
  const destructive = variant === 'destructive';
  return box({
    layout: 'column', padding: [16, 16, 16, 16], radius: 8, gap: 4,
    stroke: destructive ? ref('destructive') : ref('border'),
    children: [
      text('Hinweis', { size: 14, weight: 500, color: destructive ? 'destructive' : 'foreground' }),
      text('Beschreibung des Hinweises.', { size: 14, weight: 400, color: 'muted-foreground' }),
    ],
  });
}

// --- Breadcrumb ----------------------------------------------------------
// shadcn: <nav>, text-sm, Zwischenglieder text-muted-foreground, aktuelle Seite text-foreground.
function breadcrumbPlan() {
  return box({
    layout: 'row', gap: 8, counterAlign: 'CENTER',
    children: [
      text('Start', { size: 14, color: 'muted-foreground' }),
      text('/', { size: 14, color: 'muted-foreground' }),
      text('Seite', { size: 14, weight: 500, color: 'foreground' }),
    ],
  });
}

// --- Pagination ----------------------------------------------------------
// shadcn: <nav> mit Button-artigen Seitenzahlen (ghost, aktuelle Seite outline), h-10 w-10.
function paginationPlan() {
  const page = (label, current) => box({
    layout: 'row', radius: 6, width: 36, height: 36,
    stroke: current ? ref('border') : null,
    primaryAlign: 'CENTER', counterAlign: 'CENTER',
    children: [text(label, { size: 14, weight: 500, color: current ? 'foreground' : 'muted-foreground' })],
  });
  return box({ layout: 'row', gap: 4, counterAlign: 'CENTER', children: [page('1', true), page('2', false), page('3', false)] });
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
    // Wie das echte shadcn-Input rendert dieser Katalog-Import ein natives <input> — ein
    // HTML-Void-Element, das KEINE children verträgt (React wirft sonst "input is a void element
    // tag…"). Live-Fund 24.07. (echter Prod-Scan, KI-Interpretation lieferte Platzhaltertext im
    // Input-Fallback-HTML): walkCatalogRef darf für diesen Import nie Text als JSX-Children setzen.
    voidElement: true,
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
    // Container (Spec 2026-07-25-komposition-gegroundeter-bausteine-design.md §Entscheidung 3):
    // Eine Card TRÄGT den interpretierten Unterbaum, statt ihn zu einem Label einzuschmelzen.
    // `cardPlan()`s Padding und Platzhalter-Kinder sind das EIGENSTÄNDIGE Rendering (Katalog-
    // Vorschau); als Hülle werden nur fill/stroke/radius übernommen — shadcns echte Card hat selbst
    // kein Padding (das liegt in CardHeader/CardContent).
    container: true,
    // Sub-Komponenten-Slots (Spec 2026-07-25-sub-komponenten-slots-design.md, Scheibe A): ab zwei
    // Fallback-Kindern verteilt planToJsx den Unterbaum auf CardHeader (erstes Kind) und CardContent
    // (Rest) statt sie flach unter <Card> zu hängen — idiomatisches Markup, ändert die Optik nicht.
    slots: {
      header: { name: 'CardHeader', import: { name: 'CardHeader', from: '@/components/ui/card' } },
      content: { name: 'CardContent', import: { name: 'CardContent', from: '@/components/ui/card' } },
    },
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
  // --- Aufstockung 26.07. (s. Block-Kommentar oben) ------------------------
  {
    name: 'Tabs',
    import: { name: 'Tabs', from: '@/components/ui/tabs' },
    variants: {},
    props: [],
    // Der Leitfall: Robs Day/Week/Month-Umschalter. Ohne diesen Eintrag labelte die KI das weiß
    // gemessene Segment als Button variant="default" — shadcns DUNKLE Primary-Variante — und der
    // Umschalter landete in Figma als schwarzer Block statt als weiße Pille auf grauer Leiste.
    match: { tag: 'div', hints: ['tabs', 'tablist', 'segmented', 'switcher', 'period', 'timeframe'] },
    plan: tabsPlan,
  },
  {
    name: 'ToggleGroup',
    import: { name: 'ToggleGroup', from: '@/components/ui/toggle-group' },
    variants: { variant: ['default', 'outline'] },
    props: [],
    match: { tag: 'div', hints: ['togglegroup', 'buttongroup', 'segmentedcontrol'] },
    plan: toggleGroupPlan,
  },
  {
    name: 'Progress',
    import: { name: 'Progress', from: '@/components/ui/progress' },
    variants: {},
    props: ['value'],
    match: { tag: 'div', hints: ['progress', 'progressbar', 'meter', 'usage', 'storage', 'quota'] },
    plan: progressPlan,
  },
  {
    name: 'Switch',
    import: { name: 'Switch', from: '@/components/ui/switch' },
    variants: {},
    props: ['checked', 'disabled'],
    match: { tag: 'input', hints: ['switch', 'toggle'] },
    plan: switchPlan,
  },
  {
    name: 'Skeleton',
    import: { name: 'Skeleton', from: '@/components/ui/skeleton' },
    variants: {},
    props: [],
    match: { tag: 'div', hints: ['skeleton', 'placeholder', 'loading', 'shimmer'] },
    plan: skeletonPlan,
  },
  {
    name: 'Textarea',
    import: { name: 'Textarea', from: '@/components/ui/textarea' },
    variants: {},
    props: ['disabled', 'placeholder'],
    match: { tag: 'textarea', hints: ['textarea', 'multiline', 'message', 'comment'] },
    plan: textareaPlan,
    // Wie Input: shadcns Textarea rendert ein natives <textarea>, das in React keine Children
    // verträgt (Wert läuft über value/defaultValue). Ohne dieses Flag setzte walkCatalogRef den
    // gemessenen Platzhaltertext als Children → React-Fehler im exportierten Storybook.
    voidElement: true,
  },
  {
    name: 'Alert',
    import: { name: 'Alert', from: '@/components/ui/alert' },
    variants: { variant: ['default', 'destructive'] },
    props: [],
    match: { tag: 'div', hints: ['alert', 'notice', 'banner', 'warning', 'callout'] },
    plan: alertPlan,
  },
  {
    name: 'Breadcrumb',
    import: { name: 'Breadcrumb', from: '@/components/ui/breadcrumb' },
    variants: {},
    props: [],
    match: { tag: 'nav', hints: ['breadcrumb', 'crumbs', 'pfad'] },
    plan: breadcrumbPlan,
  },
  {
    name: 'Pagination',
    import: { name: 'Pagination', from: '@/components/ui/pagination' },
    variants: {},
    props: [],
    match: { tag: 'nav', hints: ['pagination', 'pager', 'seiten'] },
    plan: paginationPlan,
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
