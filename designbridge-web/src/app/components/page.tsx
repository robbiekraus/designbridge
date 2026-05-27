import { readJSON } from '@/lib/data';

interface ComponentEntry {
  uuid: string;
  name: string;
  figmaNodeId: string;
  figmaFileKey: string;
  figmaUrl: string;
  category: string;
  description: string;
  props: Array<{ name: string; type: string; values: string[]; default: unknown }>;
  tokenRefs: string[];
  codeRef: string | null;
  status: string;
  lastSyncedAt: string;
}

interface ComponentsManifest {
  version: string;
  exportedAt: string;
  components: ComponentEntry[];
}

const STATUS_BADGE: Record<string, string> = {
  new: 'bg-emerald-900 text-emerald-300 border-emerald-700',
  synced: 'bg-blue-900 text-blue-300 border-blue-700',
  modified: 'bg-amber-900 text-amber-300 border-amber-700',
};

const CATEGORY_BADGE: Record<string, string> = {
  atom: 'bg-violet-900 text-violet-300 border-violet-700',
  molecule: 'bg-sky-900 text-sky-300 border-sky-700',
  organism: 'bg-pink-900 text-pink-300 border-pink-700',
  template: 'bg-orange-900 text-orange-300 border-orange-700',
};

function Badge({ label, colorClass }: { label: string; colorClass: string }) {
  return (
    <span className={`inline-block text-xs px-2 py-0.5 rounded border font-medium ${colorClass}`}>
      {label}
    </span>
  );
}

export default function ComponentsPage() {
  const manifest = readJSON<ComponentsManifest>('components.manifest.json');
  const components = manifest?.components ?? [];

  if (components.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Components</h1>
        <p className="text-gray-500">No components exported yet. Run the Figma plugin to generate data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Components</h1>
        <span className="text-sm text-gray-500">{components.length} total</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {components.map((c) => (
          <div key={c.uuid} className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col gap-3">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-semibold text-white leading-tight">{c.name}</h2>
              <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
                <Badge label={c.status} colorClass={STATUS_BADGE[c.status] ?? 'bg-gray-800 text-gray-400 border-gray-700'} />
                <Badge label={c.category} colorClass={CATEGORY_BADGE[c.category] ?? 'bg-gray-800 text-gray-400 border-gray-700'} />
              </div>
            </div>

            {/* Description */}
            {c.description && (
              <p className="text-xs text-gray-400 leading-relaxed">{c.description}</p>
            )}

            {/* Props */}
            {c.props.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1.5">Props</p>
                <div className="flex flex-wrap gap-1">
                  {c.props.map((p) => (
                    <span key={p.name} className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded font-mono">
                      {p.name}: {p.type}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Token Refs */}
            {c.tokenRefs.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1.5">Token Refs</p>
                <div className="flex flex-wrap gap-1">
                  {c.tokenRefs.map((ref) => (
                    <span key={ref} className="text-xs bg-gray-800 text-violet-300 px-2 py-0.5 rounded font-mono">
                      {ref}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-800">
              {c.codeRef ? (
                <span className="text-xs text-gray-500 font-mono truncate max-w-[160px]">{c.codeRef}</span>
              ) : (
                <span className="text-xs text-gray-600">No code ref</span>
              )}
              <a
                href={c.figmaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors shrink-0 ml-2"
              >
                Open in Figma →
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
