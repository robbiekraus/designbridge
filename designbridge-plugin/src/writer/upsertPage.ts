// designbridge-plugin/src/writer/upsertPage.ts
// Findet/erzeugt die Seite „🌉 DesignBridge" mit drei Auto-Layout-Sektionen.
import type { SectionFrames } from './buildComponents';

export const PAGE_NAME = '🌉 DesignBridge';

const SECTIONS: Array<{ key: keyof SectionFrames; title: string }> = [
  { key: 'atom', title: 'Atoms' },
  { key: 'molecule', title: 'Molecules' },
  { key: 'organism', title: 'Organisms' },
  { key: 'template', title: 'Templates' },
];

async function sectionHeading(title: string): Promise<TextNode> {
  const t = figma.createText();
  try {
    await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });
    t.fontName = { family: 'Inter', style: 'Bold' };
  } catch {
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    t.fontName = { family: 'Inter', style: 'Regular' };
  }
  t.characters = title;
  t.fontSize = 20;
  return t;
}

function findSection(page: PageNode, title: string): FrameNode | undefined {
  const node = page.children.find((c) => c.type === 'FRAME' && c.name === `DB/${title}`);
  return node as FrameNode | undefined;
}

async function createSection(page: PageNode, title: string): Promise<FrameNode> {
  const frame = figma.createFrame();
  try {
    frame.name = `DB/${title}`;
    frame.layoutMode = 'VERTICAL';
    frame.primaryAxisSizingMode = 'AUTO';
    frame.counterAxisSizingMode = 'AUTO';
    frame.itemSpacing = 24;
    frame.paddingTop = 24; frame.paddingRight = 24; frame.paddingBottom = 24; frame.paddingLeft = 24;
    frame.fills = [];
    frame.appendChild(await sectionHeading(title));
    page.appendChild(frame);
    return frame;
  } catch (err) {
    // Waise vermeiden: bereits erzeugten Frame abräumen, dann re-throwen.
    try {
      frame.remove();
    } catch {
      // remove kann selbst werfen — bewusst ignorieren.
    }
    throw err;
  }
}

export async function upsertPage(): Promise<{ page: PageNode; sections: SectionFrames }> {
  let page = figma.root.children.find((p) => p.name === PAGE_NAME);
  if (!page) {
    page = figma.createPage();
    page.name = PAGE_NAME;
  }
  await page.loadAsync();

  const sections = {} as SectionFrames;
  for (const s of SECTIONS) {
    sections[s.key] = findSection(page, s.title) ?? (await createSection(page, s.title));
  }
  return { page, sections };
}

/** Sektionen untereinander stapeln (nach dem Bauen, wenn Auto-Layout Größen kennt). */
export function layoutSections(sections: SectionFrames): void {
  let y = 0;
  for (const s of SECTIONS) {
    const frame = sections[s.key];
    // Sektion ausblenden, wenn außer der Überschrift nichts drin ist
    frame.visible = frame.children.length > 1;
    if (!frame.visible) continue;
    frame.x = 0;
    frame.y = y;
    y += frame.height + 64;
  }
}
