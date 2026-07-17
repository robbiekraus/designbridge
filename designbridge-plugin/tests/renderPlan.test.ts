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
import type { PlanBox, PlanText, SectionFrames } from '../src/writer/parsePayload';

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

/** Installiert einen minimalen figma-Stub global. Nur Box-Pläne ohne SVG-/component-ref-
 *  Kinder werden hier gerendert, daher bleibt createNodeFromSvg ein Stub, der im Testpfad
 *  nicht aufgerufen wird, aber typenmäßig vorhanden sein muss, falls renderPlan.ts ihn
 *  referenziert. createText/loadFontAsync werden für die absolute-Positionierungs-Tests
 *  auf Text-Kindern gebraucht (Fix Plan-Fidelity-Scheibe A). */
function installFigmaStub(): { frames: FrameStub[]; texts: TextStub[] } {
  const frames: FrameStub[] = [];
  const texts: TextStub[] = [];
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
      throw new Error('createNodeFromSvg nicht erwartet in diesem Test');
    },
    loadFontAsync: async () => {},
  };
  return { frames, texts };
}

function emptySections(): SectionFrames {
  return {
    atomic: { children: [] } as unknown as SectionFrames['atomic'],
    component: { children: [] } as unknown as SectionFrames['component'],
    pattern: { children: [] } as unknown as SectionFrames['pattern'],
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
