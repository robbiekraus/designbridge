import { getFlatColors, getFlatTypography } from '@/lib/data';

interface TypographyValue {
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  lineHeight?: string;
}

function groupByCategory(tokens: Array<{ path: string; value: unknown; type: string }>) {
  const groups: Record<string, typeof tokens> = {};
  for (const token of tokens) {
    const parts = token.path.split('.');
    const category = parts.length >= 3 ? parts.slice(0, 2).join('.') : parts[0];
    if (!groups[category]) groups[category] = [];
    groups[category].push(token);
  }
  return groups;
}

export default function TokensPage() {
  const colors = getFlatColors();
  const typography = getFlatTypography();

  const colorGroups = groupByCategory(colors);
  const typoGroups = groupByCategory(typography);

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-bold">Tokens</h1>

      {/* Color Tokens */}
      <section>
        <h2 className="text-lg font-semibold mb-4 text-gray-300">
          Color Tokens <span className="text-gray-600 font-normal text-sm ml-1">({colors.length})</span>
        </h2>

        {colors.length === 0 && (
          <p className="text-sm text-gray-500">No color tokens exported yet.</p>
        )}

        <div className="space-y-8">
          {Object.entries(colorGroups).map(([group, tokens]) => (
            <div key={group}>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">{group}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
                {tokens.map((token) => (
                  <div key={token.path} className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
                    <div
                      className="h-12 w-full"
                      style={{ backgroundColor: String(token.value) }}
                    />
                    <div className="p-2">
                      <p className="text-xs text-gray-300 font-medium truncate">
                        {token.path.split('.').pop()}
                      </p>
                      <p className="text-xs text-gray-600 font-mono mt-0.5">{String(token.value)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Typography Tokens */}
      <section>
        <h2 className="text-lg font-semibold mb-4 text-gray-300">
          Typography Tokens <span className="text-gray-600 font-normal text-sm ml-1">({typography.length})</span>
        </h2>

        {typography.length === 0 && (
          <p className="text-sm text-gray-500">No typography tokens exported yet.</p>
        )}

        <div className="space-y-8">
          {Object.entries(typoGroups).map(([group, tokens]) => (
            <div key={group}>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">{group}</p>
              <div className="space-y-3">
                {tokens.map((token) => {
                  const tv = token.value as TypographyValue;
                  const label = token.path.split('.').pop() ?? token.path;
                  return (
                    <div key={token.path} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-4">
                      {/* Live specimen */}
                      <div
                        className="text-white shrink-0"
                        style={{
                          fontFamily: tv?.fontFamily ?? 'inherit',
                          fontSize: tv?.fontSize ?? '1rem',
                          fontWeight: tv?.fontWeight ?? 'normal',
                          lineHeight: tv?.lineHeight ?? 'normal',
                        }}
                      >
                        Ag
                      </div>
                      {/* Metadata */}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white">{label}</p>
                        <p className="text-xs text-gray-500 font-mono mt-0.5">
                          {tv?.fontFamily} · {tv?.fontSize} / {tv?.lineHeight} · {tv?.fontWeight}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
