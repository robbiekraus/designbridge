import { readJSON, getFlatColors } from '@/lib/data';

interface ComponentsManifest {
  version: string;
  exportedAt: string;
  components: Array<{
    uuid: string;
    name: string;
    category: string;
    status: string;
    tokenRefs: string[];
    figmaUrl: string;
  }>;
}

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-3xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

export default function OverviewPage() {
  const manifest = readJSON<ComponentsManifest>('components.manifest.json');
  const colors = getFlatColors();
  const components = manifest?.components ?? [];

  const statusCount = components.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {});

  const categoryCount = components.reduce<Record<string, number>>((acc, c) => {
    acc[c.category] = (acc[c.category] ?? 0) + 1;
    return acc;
  }, {});

  const colorTokens = readJSON<Record<string, unknown>>('tokens.json');
  const typographyCount = (() => {
    if (!colorTokens?.typography) return 0;
    let n = 0;
    function count(obj: unknown): void {
      if (obj && typeof obj === 'object') {
        if ('$value' in (obj as object)) { n++; return; }
        for (const v of Object.values(obj as Record<string, unknown>)) count(v);
      }
    }
    count(colorTokens.typography);
    return n;
  })();

  const exportedAt = manifest?.exportedAt
    ? new Date(manifest.exportedAt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
    : '—';

  const STATUS_COLORS: Record<string, string> = {
    new: 'bg-emerald-500',
    synced: 'bg-blue-500',
    modified: 'bg-amber-500',
  };

  const CATEGORY_COLORS: Record<string, string> = {
    atom: 'bg-violet-500',
    molecule: 'bg-sky-500',
    organism: 'bg-pink-500',
    template: 'bg-orange-500',
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-1">Overview</h1>
        <p className="text-sm text-gray-500">Last export: {exportedAt}</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Components" value={components.length} />
        <StatCard label="Color Tokens" value={colors.length} />
        <StatCard label="Typography Tokens" value={typographyCount} />
        <StatCard label="Version" value={manifest?.version ?? '—'} />
      </div>

      {/* Status bar */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Sync Status</h2>
        <div className="flex gap-6 flex-wrap">
          {Object.entries(statusCount).map(([status, count]) => (
            <div key={status} className="flex items-center gap-2">
              <span className={`inline-block w-2.5 h-2.5 rounded-full ${STATUS_COLORS[status] ?? 'bg-gray-500'}`} />
              <span className="text-sm text-gray-300 capitalize">{status}</span>
              <span className="text-sm font-bold text-white">{count}</span>
            </div>
          ))}
          {components.length === 0 && (
            <p className="text-sm text-gray-500">No components exported yet. Run the Figma plugin to generate data.</p>
          )}
        </div>
      </section>

      {/* Category distribution */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">By Category</h2>
        <div className="flex gap-6 flex-wrap">
          {Object.entries(categoryCount).map(([cat, count]) => (
            <div key={cat} className="flex items-center gap-2">
              <span className={`inline-block w-2.5 h-2.5 rounded-full ${CATEGORY_COLORS[cat] ?? 'bg-gray-500'}`} />
              <span className="text-sm text-gray-300 capitalize">{cat}</span>
              <span className="text-sm font-bold text-white">{count}</span>
            </div>
          ))}
          {components.length === 0 && (
            <p className="text-sm text-gray-500">—</p>
          )}
        </div>
      </section>

      {/* Color preview strip */}
      {colors.length > 0 && (
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
            Color Tokens ({colors.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            {colors.slice(0, 32).map((token) => (
              <div key={token.path} title={`${token.path}\n${token.value}`} className="flex flex-col items-center gap-1">
                <div
                  className="w-8 h-8 rounded border border-gray-700"
                  style={{ backgroundColor: String(token.value) }}
                />
                <span className="text-[9px] text-gray-600 max-w-[32px] truncate">{String(token.path).split('.').pop()}</span>
              </div>
            ))}
            {colors.length > 32 && (
              <div className="w-8 h-8 rounded border border-gray-700 flex items-center justify-center text-xs text-gray-500">
                +{colors.length - 32}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
