// Unit tests for renderPlan.ts (Fix 6, Testrunde 6, Punkt 3:
// docs/superpowers/specs/2026-07-17-testrunde6-fixes-design.md).
//
// Befund per Figma-MCP-Inspektion: Container 2:175 hatte layoutMode:HORIZONTAL + FIXED 459px +
// clipsContent — Chart-Body landete außerhalb des sichtbaren Bereichs. Ursache Teil 1 war der
// htmlToPlan-Bug (Block-Container fälschlich 'row', siehe htmlToPlan.test.js). Dieser Test prüft
// Teil 2 der Spec-Frage: verhält sich der Plugin-Renderer bei plan.width==null korrekt (HUG, kein
// Clipping), oder verstärkt er das Problem zusätzlich?
//
// Bis hierhin gab es KEINEN figma-API-Mock in diesem Plugin (siehe parsePlan.test.ts-Kommentar:
// "renderer branches (renderPlan/buildComponents) are not covered here"). Dieser Test führt einen
// minimalen, lokalen Stub ein — nur die auf FrameNode/TextNode tatsächlich gelesenen/gesetzten
// Properties, die renderPlan.ts anfasst. Kein neues Package, kein globaler Mock-Helper.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPlan } from '../src/writer/renderPlan';
import type { PlanBox, PlanText } from '../src/writer/parsePayload';
import type { SectionFrames } from '../src/writer/buildComponents';

type FrameStub = {
  type: 'FRAME';
  layoutMode: string;
  primaryAxisSizingMode: string;
  counterAxisSizingMode: string;
  primaryAxisAlignItems: string;
  counterAxisAlignItems: string;
  itemSpacing: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  cornerRadius: number;
  fills: unknown[];
  strokes: unknown[];
  strokeWeight: number;
  clipsContent: boolean;
  width: number;
  height: number;
  x: number;
  y: number;
  layoutPositioning: string;
  // Stretch & Grow (docs/superpowers/specs/2026-07-18-pattern-fidelity-stretch-grow-design.md):
  // Figma-Realverhalten-Default für Auto-Layout-Kinder ist 'INHERIT' (layoutAlign) / 0 (layoutGrow) —
  // der Stub spiegelt das, damit die Guard-Tests (kein Stretch/Grow) einen echten Default statt
  // eines freundlich vorbelegten "leeren" Werts prüfen.
  layoutAlign: string;
  layoutGrow: number;
  children: unknown[];
  removed: boolean;
  appendChild(node: unknown): void;
  resize(w: number, h: number): void;
  remove(): void;
};

function makeFrameStub(): FrameStub {
  return {
    type: 'FRAME',
    layoutMode: 'NONE',
    primaryAxisSizingMode: 'AUTO',
    counterAxisSizingMode: 'AUTO',
    primaryAxisAlignItems: 'MIN',
    counterAxisAlignItems: 'MIN',
    itemSpacing: 0,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    cornerRadius: 0,
    fills: [],
    strokes: [],
    strokeWeight: 1,
    // Figma-Realverhalten: figma.createFrame() liefert clipsContent DEFAULT true. Der Stub
    // spiegelt das bewusst, statt es "freundlich" auf false vorzubelegen — sonst würde der Test
    // nicht zeigen, ob renderPlan.ts den Default aktiv korrigiert.
    clipsContent: true,
    width: 100,
    height: 100,
    x: 0,
    y: 0,
    // Figma-Realverhalten: Kinder eines Auto-Layout-Frames starten mit layoutPositioning 'AUTO'.
    layoutPositioning: 'AUTO',
    layoutAlign: 'INHERIT',
    layoutGrow: 0,
    children: [],
    removed: false,
    appendChild(node: unknown) {
      this.children.push(node);
    },
    resize(w: number, h: number) {
      this.width = w;
      this.height = h;
    },
    remove() {
      this.removed = true;
    },
  };
}

type TextStub = {
  type: 'TEXT';
  characters: string;
  fontSize: number;
  fontName: unknown;
  textAlignHorizontal: string;
  lineHeight: unknown;
  fills: unknown[];
  x: number;
  y: number;
  layoutPositioning: string;
  layoutAlign: string;
  layoutGrow: number;
  width: number;
  height: number;
  textAutoResize: string;
  setFillStyleIdAsync(id: string): Promise<void>;
  resize(w: number, h: number): void;
};

function makeTextStub(): TextStub {
  return {
    type: 'TEXT',
    characters: '',
    fontSize: 16,
    fontName: null,
    textAlignHorizontal: 'LEFT',
    lineHeight: undefined,
    fills: [],
    x: 0,
    y: 0,
    layoutPositioning: 'AUTO',
    layoutAlign: 'INHERIT',
    layoutGrow: 0,
    width: 100,
    height: 20,
    textAutoResize: 'WIDTH_AND_HEIGHT',
    setFillStyleIdAsync: async () => {},
    resize(w: number, h: number) {
      this.width = w;
      this.height = h;
    },
  };
}

type SvgStub = {
  type: 'VECTOR_GROUP';
  x: number;
  y: number;
  width: number;
  height: number;
  layoutPositioning: string;
  layoutAlign: string;
  layoutGrow: number;
  resize(w: number, h: number): void;
};

function makeSvgStub(): SvgStub {
  return {
    type: 'VECTOR_GROUP',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    layoutPositioning: 'AUTO',
    layoutAlign: 'INHERIT',
    layoutGrow: 0,
    resize(w: number, h: number) {
      this.width = w;
      this.height = h;
    },
  };
}

/** Installiert einen minimalen figma-Stub global. Nur Box-Pläne ohne SVG-/component-ref-
 *  Kinder werden hier gerendert, daher bleibt createNodeFromSvg ein Stub, der im Testpfad
 *  nicht aufgerufen wird, aber typenmäßig vorhanden sein muss, falls renderPlan.ts ihn
 *  referenziert. createText/loadFontAsync werden für die absolute-Positionierungs-Tests
 *  auf Text-Kindern gebraucht (Fix Plan-Fidelity-Scheibe A). withSvg (Stretch & Grow,
 *  2026-07-18) schaltet einen funktionierenden createNodeFromSvg-Stub frei — nur für den
 *  Test „svg bekommt nie stretch/grow" gebraucht. */
function installFigmaStub(options: { withSvg?: boolean } = {}): {
  frames: FrameStub[];
  texts: TextStub[];
  svgs: SvgStub[];
} {
  const frames: FrameStub[] = [];
  const texts: TextStub[] = [];
  const svgs: SvgStub[] = [];
  (globalThis as unknown as { figma: unknown }).figma = {
    createFrame: () => {
      const f = makeFrameStub();
      frames.push(f);
      return f;
    },
    createText: () => {
      const t = makeTextStub();
      texts.push(t);
      return t;
    },
    createNodeFromSvg: () => {
      if (!options.withSvg) {
        throw new Error('createNodeFromSvg nicht erwartet in diesem Test');
      }
      const s = makeSvgStub();
      svgs.push(s);
      return s;
    },
    loadFontAsync: async () => {},
  };
  return { frames, texts, svgs };
}

function emptySections(): SectionFrames {
  return {
    atom: { children: [] } as unknown as SectionFrames['atom'],
    molecule: { children: [] } as unknown as SectionFrames['molecule'],
    organism: { children: [] } as unknown as SectionFrames['organism'],
    template: { children: [] } as unknown as SectionFrames['template'],
  };
}

function emptyBox(overrides: Partial<PlanBox> = {}): PlanBox {
  return {
    type: 'box',
    layout: 'row',
    padding: [0, 0, 0, 0],
    radius: 0,
    fill: null,
    stroke: null,
    strokeWeight: 1,
    gap: 0,
    width: null,
    height: null,
    primaryAlign: 'MIN',
    counterAlign: 'CENTER',
    children: [],
    ...overrides,
  };
}

function emptyText(overrides: Partial<PlanText> = {}): PlanText {
  return {
    type: 'text',
    content: 'Hi',
    fontSize: 14,
    fontWeight: 400,
    color: { token: null, hex: '#000000' },
    align: 'left',
    lineHeight: null,
    ...overrides,
  };
}

test('Box ohne width/height (HUG) → beide Achsen bleiben AUTO, kein Clipping', async () => {
  installFigmaStub();
  const frame = (await renderPlan(emptyBox(), new Map(), [], emptySections())) as unknown as FrameStub;
  assert.equal(frame.primaryAxisSizingMode, 'AUTO');
  assert.equal(frame.counterAxisSizingMode, 'AUTO');
  assert.equal(frame.clipsContent, false, 'HUG-Box darf laut Spec (Fix 6) nicht clippen');
});

test('Box mit explizit gesetzter width (layout row) → primaryAxisSizingMode FIXED + clipsContent true', async () => {
  installFigmaStub();
  const frame = (await renderPlan(
    emptyBox({ width: 200, layout: 'row' }),
    new Map(),
    [],
    emptySections()
  )) as unknown as FrameStub;
  assert.equal(frame.primaryAxisSizingMode, 'FIXED');
  assert.equal(frame.counterAxisSizingMode, 'AUTO');
  assert.equal(frame.clipsContent, true, 'explizit gesetzte Größe darf weiterhin clippen');
});

test('Box mit explizit gesetzter height (layout column) → primaryAxisSizingMode FIXED (vertikale Achse) + clipsContent true', async () => {
  installFigmaStub();
  const frame = (await renderPlan(
    emptyBox({ height: 300, layout: 'column' }),
    new Map(),
    [],
    emptySections()
  )) as unknown as FrameStub;
  assert.equal(frame.primaryAxisSizingMode, 'FIXED');
  assert.equal(frame.counterAxisSizingMode, 'AUTO');
  assert.equal(frame.clipsContent, true);
});

// ─── absolute (Plan-Fidelity-Scheibe A: docs/superpowers/specs/2026-07-17-plan-fidelity-design.md) ──
//
// Figma-Fallstrick: layoutPositioning='ABSOLUTE' auf einem Kind wirft, solange es noch nicht
// in seinen Auto-Layout-Parent eingehängt ist. renderPlan.ts muss appendChild() also VOR dem
// Setzen von layoutPositioning aufrufen — die Reihenfolge wird hier indirekt mitgeprüft: der
// Stub trackt appendChild via children.push, layoutPositioning landet auf dem bereits im Array
// befindlichen Kind-Objekt (Referenzgleichheit), ein Vertauschen der Reihenfolge im Produktivcode
// würde die Assertions unten trotzdem erfüllen — die echte Reihenfolge-Garantie kommt aus dem
// Figma-Laufzeitverhalten selbst (throw bei ABSOLUTE vor appendChild), nicht aus diesem Stub.
// Der Smoke-Test unten deckt das nur so weit ab, wie ein reiner Objekt-Stub kann.

test('Box-Kind mit absolute bekommt layoutPositioning ABSOLUTE + x/y + resize(width, height)', async () => {
  installFigmaStub();
  const child = emptyBox({ absolute: { x: 12, y: 34, width: 56, height: 78 } });
  const parent = emptyBox({ children: [child] });
  const frame = (await renderPlan(parent, new Map(), [], emptySections())) as unknown as FrameStub;
  const rendered = frame.children[0] as FrameStub;
  assert.equal(rendered.layoutPositioning, 'ABSOLUTE');
  assert.equal(rendered.x, 12);
  assert.equal(rendered.y, 34);
  assert.equal(rendered.width, 56);
  assert.equal(rendered.height, 78);
});

test('Box-Kind ohne absolute bleibt layoutPositioning AUTO (unverändertes Rendern)', async () => {
  installFigmaStub();
  const child = emptyBox();
  const parent = emptyBox({ children: [child] });
  const frame = (await renderPlan(parent, new Map(), [], emptySections())) as unknown as FrameStub;
  const rendered = frame.children[0] as FrameStub;
  assert.equal(rendered.layoutPositioning, 'AUTO');
  assert.equal(rendered.x, 0);
  assert.equal(rendered.y, 0);
});

test('Payload ohne absolute-Feld überhaupt (Rückwärtskompatibilität) rendert wie zuvor', async () => {
  installFigmaStub();
  // absolute wird gar nicht im Objekt gesetzt (kein `absolute: null`, kein Feld) —
  // genau der Fall eines alten Payloads, das den Parser vor dieser Änderung nie kannte.
  const child = emptyBox();
  delete (child as { absolute?: unknown }).absolute;
  const parent = emptyBox({ children: [child] });
  const frame = (await renderPlan(parent, new Map(), [], emptySections())) as unknown as FrameStub;
  const rendered = frame.children[0] as FrameStub;
  assert.equal(rendered.layoutPositioning, 'AUTO');
  assert.equal(frame.clipsContent, false);
});

test('Text-Kind mit absolute: textAutoResize HEIGHT + Breite fixiert, wenn width > 0', async () => {
  installFigmaStub();
  const child = emptyText({ absolute: { x: 5, y: 6, width: 200, height: 40 } });
  const parent = emptyBox({ children: [child] });
  const frame = (await renderPlan(parent, new Map(), [], emptySections())) as unknown as FrameStub;
  const rendered = frame.children[0] as unknown as TextStub;
  assert.equal(rendered.layoutPositioning, 'ABSOLUTE');
  assert.equal(rendered.x, 5);
  assert.equal(rendered.y, 6);
  assert.equal(rendered.textAutoResize, 'HEIGHT');
  assert.equal(rendered.width, 200);
});

test('Text-Kind mit absolute width 0: Breite wird NICHT fixiert (nur width > 0 löst resize aus)', async () => {
  installFigmaStub();
  const child = emptyText({ absolute: { x: 5, y: 6, width: 0, height: 40 } });
  const parent = emptyBox({ children: [child] });
  const frame = (await renderPlan(parent, new Map(), [], emptySections())) as unknown as FrameStub;
  const rendered = frame.children[0] as unknown as TextStub;
  assert.equal(rendered.layoutPositioning, 'ABSOLUTE');
  assert.equal(rendered.textAutoResize, 'HEIGHT');
  // Stub-Startwert (100) bleibt unverändert, weil resize() bei width<=0 nicht aufgerufen wird.
  assert.equal(rendered.width, 100);
});

test('Waisen-Cleanup bleibt intakt: absolute-Kind schon gerendert + positioniert, ein späteres Geschwister wirft → Parent-Frame wird entfernt', async () => {
  const { frames } = installFigmaStub();
  const goodChild = emptyBox({ absolute: { x: 1, y: 2, width: 3, height: 4 } });
  // fill mit ungültigem Hex bringt hexToRgb (parsePayload.ts) zum Werfen — bestehender Fehlerpfad,
  // unabhängig von der absolute-Änderung.
  const badChild = emptyBox({ fill: { token: null, hex: 'not-a-color' } });
  const parent = emptyBox({ children: [goodChild, badChild] });
  await assert.rejects(() => renderPlan(parent, new Map(), [], emptySections()));
  // frames[0] ist der Parent-Frame (zuerst erzeugt, siehe renderPlan.ts: figma.createFrame() ist
  // die erste Zeile). Er muss trotz bereits erfolgreich positioniertem ersten Kind wieder
  // entfernt werden — die absolute-Änderung darf den bestehenden Waisen-Cleanup-Pfad nicht
  // aushebeln.
  assert.equal(frames[0].removed, true);
});

// ─── Stretch & Grow (Pattern-Fidelity-Scheibe, docs/superpowers/specs/2026-07-18-pattern-fidelity-stretch-grow-design.md) ──
//
// Guard-Vertrag: STRETCH braucht eine bestimmte GEGENachse des Parents, GROW eine bestimmte
// PRIMÄRachse. Ohne das (HUG-Parent) bleibt das heutige Verhalten (kein Stretch/Grow) erhalten —
// ein STRETCH-Kind in einer HUG-Achse ist in Figma nicht definiert (s. Spec-Guard-Pflicht).

test('Guard: HUG-Parent (row, kein width/height) → stretch:true-Kind bekommt KEIN STRETCH', async () => {
  installFigmaStub();
  const child = emptyBox({ layout: 'row', stretch: true });
  const parent = emptyBox({ layout: 'row', children: [child] }); // width/height beide null (HUG)
  const frame = (await renderPlan(parent, new Map(), [], emptySections())) as unknown as FrameStub;
  const rendered = frame.children[0] as FrameStub;
  assert.equal(rendered.layoutAlign, 'INHERIT', 'HUG-Gegenachse darf kein STRETCH auslösen');
});

test('Guard: HUG-Parent (row, kein width) → grow:true-Kind bekommt KEIN layoutGrow', async () => {
  installFigmaStub();
  const child = emptyBox({ layout: 'row', grow: true });
  const parent = emptyBox({ layout: 'row', children: [child] }); // width null (HUG) → Primärachse unbestimmt
  const frame = (await renderPlan(parent, new Map(), [], emptySections())) as unknown as FrameStub;
  const rendered = frame.children[0] as FrameStub;
  assert.equal(rendered.layoutGrow, 0, 'HUG-Primärachse darf kein Grow auslösen');
});

test('row-Parent mit bestimmter Höhe (Gegenachse) → stretch:true-Kind bekommt layoutAlign STRETCH', async () => {
  installFigmaStub();
  const child = emptyBox({ layout: 'row', stretch: true });
  const parent = emptyBox({ layout: 'row', height: 100, children: [child] });
  const frame = (await renderPlan(parent, new Map(), [], emptySections())) as unknown as FrameStub;
  const rendered = frame.children[0] as FrameStub;
  assert.equal(rendered.layoutAlign, 'STRETCH');
});

test('row-Parent mit bestimmter Breite (Primärachse) → grow:true-Kind bekommt layoutGrow 1', async () => {
  installFigmaStub();
  const child = emptyBox({ layout: 'row', grow: true });
  const parent = emptyBox({ layout: 'row', width: 300, children: [child] });
  const frame = (await renderPlan(parent, new Map(), [], emptySections())) as unknown as FrameStub;
  const rendered = frame.children[0] as FrameStub;
  assert.equal(rendered.layoutGrow, 1);
});

test('column-Parent mit bestimmter Breite (Gegenachse) → stretch:true-Kind bekommt layoutAlign STRETCH', async () => {
  installFigmaStub();
  const child = emptyBox({ layout: 'column', stretch: true });
  const parent = emptyBox({ layout: 'column', width: 320, children: [child] });
  const frame = (await renderPlan(parent, new Map(), [], emptySections())) as unknown as FrameStub;
  const rendered = frame.children[0] as FrameStub;
  assert.equal(rendered.layoutAlign, 'STRETCH');
});

test('absolute gewinnt über stretch/grow: absolutes Kind bekommt trotz stretch/grow:true KEIN STRETCH/Grow', async () => {
  installFigmaStub();
  const child = emptyBox({
    layout: 'row',
    stretch: true,
    grow: true,
    absolute: { x: 1, y: 2, width: 3, height: 4 },
  });
  const parent = emptyBox({ layout: 'row', width: 300, height: 100, children: [child] });
  const frame = (await renderPlan(parent, new Map(), [], emptySections())) as unknown as FrameStub;
  const rendered = frame.children[0] as FrameStub;
  assert.equal(rendered.layoutPositioning, 'ABSOLUTE');
  assert.equal(rendered.layoutAlign, 'INHERIT', 'absolute schließt STRETCH aus');
  assert.equal(rendered.layoutGrow, 0, 'absolute schließt Grow aus');
});

test('svg bekommt NIE stretch/grow, auch bei bestimmten Achsen auf beiden Seiten', async () => {
  const { svgs } = installFigmaStub({ withSvg: true });
  const child = {
    type: 'svg' as const,
    markup: '<svg></svg>',
    stretch: true as const,
    grow: true as const,
  };
  const parent = emptyBox({ layout: 'row', width: 300, height: 100, children: [child] });
  await renderPlan(parent, new Map(), [], emptySections());
  assert.equal(svgs.length, 1);
  assert.equal(svgs[0].layoutAlign, 'INHERIT', 'svg darf nie STRETCH bekommen');
  assert.equal(svgs[0].layoutGrow, 0, 'svg darf nie Grow bekommen');
});

test('Text-Stretch nur in column-Parents: column-Parent mit bestimmter Breite → STRETCH + textAutoResize HEIGHT', async () => {
  installFigmaStub();
  const child = emptyText({ stretch: true });
  const parent = emptyBox({ layout: 'column', width: 320, children: [child] });
  const frame = (await renderPlan(parent, new Map(), [], emptySections())) as unknown as FrameStub;
  const rendered = frame.children[0] as unknown as TextStub;
  assert.equal(rendered.layoutAlign, 'STRETCH');
  assert.equal(rendered.textAutoResize, 'HEIGHT');
});

test('Text-Stretch in row-Parents (würde Höhe füllen) wird NICHT angewendet, obwohl Gegenachse bestimmt ist', async () => {
  installFigmaStub();
  const child = emptyText({ stretch: true });
  const parent = emptyBox({ layout: 'row', height: 80, children: [child] }); // Gegenachse (Höhe) bestimmt
  const frame = (await renderPlan(parent, new Map(), [], emptySections())) as unknown as FrameStub;
  const rendered = frame.children[0] as unknown as TextStub;
  assert.equal(rendered.layoutAlign, 'INHERIT', 'Text-Stretch in row-Parents ist laut Spec ausgenommen');
  assert.equal(rendered.textAutoResize, 'WIDTH_AND_HEIGHT', 'unverändert, da Stretch nicht angewendet wurde');
});

test('Text-Grow in row-Parents: bestimmte Breite (Primärachse) → layoutGrow 1 + textAutoResize HEIGHT', async () => {
  installFigmaStub();
  const child = emptyText({ grow: true });
  const parent = emptyBox({ layout: 'row', width: 300, children: [child] });
  const frame = (await renderPlan(parent, new Map(), [], emptySections())) as unknown as FrameStub;
  const rendered = frame.children[0] as unknown as TextStub;
  assert.equal(rendered.layoutGrow, 1);
  assert.equal(rendered.textAutoResize, 'HEIGHT');
});

test('Bestimmtheits-Propagation über 2 Ebenen: Stretch/Grow-Achse korrekt weitergereicht, NICHT blind auf beide Achsen', async () => {
  // Wurzel: column, width=300 (explizit) → Gegenachse (Breite) bestimmt, Primärachse (Höhe) HUG.
  // Ebene 1 (Kind, layout row): stretch:true → Gegenachse der Wurzel ist Breite → STRETCH greift,
  // das macht Ebene 1s BREITE bestimmt (nicht die Höhe!).
  // Ebene 2 (Enkel, in Ebene 1 = row): Gegenachse von row ist Höhe → die wurde NICHT bestimmt
  // gemacht (nur Breite kam via Stretch durch) → Enkel-stretch darf NICHT greifen (Guard).
  // Enkel-grow: Primärachse von row ist Breite → die IST bestimmt (via Ebene-1-Stretch) → greift.
  installFigmaStub();
  const grandchild = emptyBox({ layout: 'row', stretch: true, grow: true });
  const child = emptyBox({ layout: 'row', stretch: true, children: [grandchild] });
  const root = emptyBox({ layout: 'column', width: 300, children: [child] });
  const frame = (await renderPlan(root, new Map(), [], emptySections())) as unknown as FrameStub;
  const renderedChild = frame.children[0] as FrameStub;
  assert.equal(renderedChild.layoutAlign, 'STRETCH', 'Ebene 1: Wurzel-Breite ist bestimmt (explizit)');
  const renderedGrandchild = renderedChild.children[0] as FrameStub;
  assert.equal(
    renderedGrandchild.layoutAlign,
    'INHERIT',
    'Ebene 2: Ebene-1-Gegenachse (Höhe) wurde NIE bestimmt gemacht — Guard muss greifen'
  );
  assert.equal(
    renderedGrandchild.layoutGrow,
    1,
    'Ebene 2: Ebene-1-Primärachse (Breite) kam über Ebene-1-Stretch durch — Grow darf greifen'
  );
});
