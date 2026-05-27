import type { ComponentEntry, DiffStats } from '../types/manifest';

function propsSignature(entry: ComponentEntry): string {
  return JSON.stringify(entry.props.map((p) => ({ name: p.name, type: p.type, values: p.values })));
}

export function applyDiff(
  current: ComponentEntry[],
  previous: ComponentEntry[]
): { components: ComponentEntry[]; stats: DiffStats } {
  const prevMap = new Map(previous.map((c) => [c.figmaNodeId, c]));
  const stats: DiffStats = { new: 0, synced: 0, modified: 0 };

  const components = current.map((entry) => {
    const prev = prevMap.get(entry.figmaNodeId);

    if (!prev) {
      stats.new++;
      return { ...entry, status: 'new' as const };
    }

    const changed =
      entry.name !== prev.name ||
      propsSignature(entry) !== propsSignature(prev);

    if (changed) {
      stats.modified++;
      return { ...entry, status: 'modified' as const };
    }

    stats.synced++;
    // Preserve codeRef from previous export if it was set
    return {
      ...entry,
      status: 'synced' as const,
      codeRef: prev.codeRef,
      lastSyncedAt: prev.lastSyncedAt,
    };
  });

  return { components, stats };
}
