// RepoDecomposer: matcht Inventar-Bausteine über ihren path auf die Repo-Datei
// und hängt den echten Quellcode als structure.code an. Erfüllt das
// Decomposer-Interface: decompose(source, inventory, {cap}) -> Segment[].
export const CODE_CAP = 8000;

const langOf = (p) => (String(p || '').match(/\.(tsx|ts|jsx|js)$/)?.[1]) ?? 'txt';

export const repoDecomposer = {
  // Default-cap = CODE_CAP: die Interpret-Route ruft decompose ohne Optionen —
  // ohne Default wandert sonst ungecappter Datei-Inhalt in den Prompt.
  async decompose({ files }, inventory, { cap = CODE_CAP } = {}) {
    const byPath = new Map((files ?? []).map((f) => [f.path, f.content]));
    return inventory.map((item, i) => {
      const content = item.path ? byPath.get(item.path) : undefined;
      const truncated = Boolean(content) && cap != null && content.length > cap;
      const code = truncated ? content.slice(0, cap) : content;
      // Leerer Inhalt ('' = pfad-only Seiten/Layouts aus extractRepoFiles) ist
      // KEIN Material — wie eine fehlende Datei behandeln, nicht als Code heben.
      return {
        id: `seg_${i}`,
        label: item.name,
        kind: item.kind ?? 'component',
        confidence: item.confidence,
        notes: truncated ? `${item.notes ?? ''} (gekürzt)`.trim() : (item.notes ?? ''),
        bounds: null,
        visual: null,
        structure: !content ? null : { code, path: item.path, lang: langOf(item.path) },
      };
    });
  },
};

// deepenRepoWithAi liefert Items ohne `path` (Claudes JSON-Schema kennt keinen).
// Ohne path liftet liftRepoInventory nichts. Diese Funktion mappt den path per
// Name aus der regelbasierten Baseline auf die merged Items zurück (mutiert sie),
// damit danach der echte Code gehoben werden kann. KI-ergänzte Items ohne
// Baseline-Match bleiben path-los (kein realer Quellcode zum Heben). Ein bereits
// gesetzter path wird nie überschrieben.
// Grenze: von der KI umbenannte Bausteine (Name ≠ Baseline-Name) matchen nicht
// und verlieren ihren Code — akzeptiert, da /repo/ai credit-gated & optional ist.
export function applyBaselinePaths(items, baseline) {
  const pathByName = new Map();
  for (const b of baseline ?? []) {
    if (b?.name && b.path && !pathByName.has(b.name)) pathByName.set(b.name, b.path);
  }
  for (const item of items ?? []) {
    if (!item.path && pathByName.has(item.name)) item.path = pathByName.get(item.name);
  }
  return items;
}

// Für die Scan-Route: hebt den (capped) Code direkt in die Inventar-Items.
// Mutiert die übergebenen Items (gleiche Referenzen wie result.atomics/components).
export async function liftRepoInventory(files, inventory, { cap = CODE_CAP } = {}) {
  const segments = await repoDecomposer.decompose({ files }, inventory, { cap });
  segments.forEach((seg, i) => {
    if (seg.structure) {
      inventory[i].sourceCode = seg.structure.code;
      inventory[i].lang = seg.structure.lang;
      if (/\(gekürzt\)$/.test(seg.notes)) inventory[i].notes = seg.notes;
    }
  });
  return inventory;
}
