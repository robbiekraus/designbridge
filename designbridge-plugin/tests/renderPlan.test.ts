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
import type { PlanBox, SectionFrames } from '../src/writer/parsePayload';

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
  children: unknown[];
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
    children: [],
    appendChild(node: unknown) {
      this.children.push(node);
    },
    resize(w: number, h: number) {
      this.width = w;
      this.height = h;
    },
    remove() {},
  };
}

/** Installiert einen minimalen figma-Stub global. Nur Box-Pläne ohne Text-/SVG-/component-ref-
 *  Kinder werden hier gerendert, daher genügt createFrame — createText/createNodeFromSvg/
 *  loadFontAsync sind Stubs, die im Testpfad nicht aufgerufen werden, aber typenmäßig vorhanden
 *  sein müssen, falls renderPlan.ts sie referenziert. */
function installFigmaStub(): { frames: FrameStub[] } {
  const frames: FrameStub[] = [];
  (globalThis as unknown as { figma: unknown }).figma = {
    createFrame: () => {
      const f = makeFrameStub();
      frames.push(f);
      return f;
    },
    createText: () => ({
      characters: '',
      fontSize: 16,
      fontName: null,
      textAlignHorizontal: 'LEFT',
      lineHeight: undefined,
      fills: [],
      setFillStyleIdAsync: async () => {},
    }),
    createNodeFromSvg: () => {
      throw new Error('createNodeFromSvg nicht erwartet in diesem Test');
    },
    loadFontAsync: async () => {},
  };
  return { frames };
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
