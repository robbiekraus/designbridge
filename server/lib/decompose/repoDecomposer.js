// RepoDecomposer: matcht Inventar-Bausteine über ihren path auf die Repo-Datei
// und hängt den echten Quellcode als structure.code an. Erfüllt das
// Decomposer-Interface: decompose(source, inventory, {cap}) -> Segment[].
export const CODE_CAP = 8000;

const langOf = (p) => (String(p || '').match(/\.(tsx|ts|jsx|js)$/)?.[1]) ?? 'txt';

export const repoDecomposer = {
  async decompose({ files }, inventory, { cap = null } = {}) {
    const byPath = new Map((files ?? []).map((f) => [f.path, f.content]));
    return inventory.map((item, i) => {
      const content = item.path ? byPath.get(item.path) : undefined;
      const truncated = content != null && cap != null && content.length > cap;
      const code = content == null ? null : (truncated ? content.slice(0, cap) : content);
      return {
        id: `seg_${i}`,
        label: item.name,
        kind: item.kind ?? 'component',
        confidence: item.confidence,
        notes: truncated ? `${item.notes ?? ''} (gekürzt)`.trim() : (item.notes ?? ''),
        bounds: null,
        visual: null,
        structure: content == null ? null : { code, path: item.path, lang: langOf(item.path) },
      };
    });
  },
};

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
