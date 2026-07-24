import React from 'react';
import ConfidencePill from '../components/library/ConfidencePill.jsx';
import { buildExports } from '../lib/emit/index.js';

const SOURCE_KIND_LABEL = { image: 'Bild', url: 'URL', repo: 'Repo', figma: 'Figma' };

function stripProtocol(url) {
  return String(url).replace(/^https?:\/\//i, '').replace(/^www\./i, '');
}

/** Menschlich lesbare Herkunft statt des reinen Import-Typs ("Quelle: url") — die echten
 *  Werte liegen längst in raw.meta (image_filename/source_url/branch), wurden nur nie
 *  angezeigt (RESUME-Polish „Quelle: url"-Platzierung). */
export function describeSource(result) {
  const kind = result?.source;
  const label = SOURCE_KIND_LABEL[kind] ?? kind ?? null;
  const meta = result?.raw?.meta ?? {};
  let value = null;
  if (kind === 'image') {
    value = meta.image_filename ?? null;
  } else if (kind === 'repo' && meta.source_url) {
    const repoPath = stripProtocol(meta.source_url).replace(/^github\.com\//i, '');
    value = meta.branch ? `${repoPath} · ${meta.branch}` : repoPath;
  } else if (meta.source_url) {
    value = stripProtocol(meta.source_url);
  }
  return { label, value };
}

function SummaryItem({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</span>
      <span className="text-sm text-zinc-900">{value}</span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">{title}</h2>
      {children}
    </section>
  );
}

function CountRow({ label, count, confidence }) {
  return (
    <li className="flex items-center justify-between px-3 py-2 border-b border-zinc-100 last:border-b-0 text-sm">
      <span className="text-zinc-900">{label}</span>
      <span className="flex items-center gap-2">
        <span className="font-semibold tabular-nums">{count}</span>
        {confidence !== undefined && <ConfidencePill value={confidence} />}
      </span>
    </li>
  );
}

export default function Dashboard({ result }) {
  const summary = result?.raw?.summary;
  const warnings = result?.raw?.warnings ?? [];
  const categories = result?.categories ?? [];
  const canExport = !!buildExports(result);

  const { label: sourceLabel, value: sourceValue } = describeSource(result);
  const tokenCategories = categories.filter(cat => cat.key !== 'inventory');
  const invExtra = categories.find(cat => cat.key === 'inventory')?.extra;
  const inventoryRows = invExtra
    ? [
        { label: 'Atoms', count: invExtra.atoms },
        { label: 'Molecules', count: invExtra.molecules },
        { label: 'Organisms', count: invExtra.organisms },
        { label: 'Templates', count: invExtra.templates },
      ]
    : [];

  return (
    <div className="max-w-3xl flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <h1 className="text-sm font-semibold text-zinc-900">Übersicht</h1>
        {result?.mocked && (
          <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">PREVIEW</span>
        )}
        {sourceLabel && (
          <span
            className="text-xs text-zinc-500 ml-auto flex items-center gap-1.5 min-w-0"
            title={sourceValue || undefined}
          >
            <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-400 shrink-0">
              {sourceLabel}
            </span>
            {sourceValue && <span className="truncate max-w-[220px]">{sourceValue}</span>}
          </span>
        )}
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-3 border border-zinc-200 rounded-lg p-4">
          <SummaryItem label="Beschreibung" value={summary.source_description} />
          <SummaryItem label="App-Typ" value={summary.app_type} />
          <SummaryItem label="Modus" value={summary.color_mode} />
          <SummaryItem label="Stil" value={summary.design_style} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-6 items-start">
        <Section title="Tokens">
          <ul className="border border-zinc-200 rounded-lg overflow-hidden">
            {tokenCategories.map(cat => (
              <CountRow key={cat.key} label={cat.label} count={cat.count} confidence={cat.confidence} />
            ))}
          </ul>
        </Section>

        {inventoryRows.length > 0 && (
          <Section title="UI Inventory">
            <ul className="border border-zinc-200 rounded-lg overflow-hidden">
              {inventoryRows.map(row => (
                <CountRow key={row.label} label={row.label} count={row.count} />
              ))}
            </ul>
          </Section>
        )}
      </div>

      <div className="flex items-center justify-between border border-zinc-200 rounded-lg px-3 py-2 text-sm">
        <span className="text-zinc-900">Export</span>
        <span className="flex items-center gap-2">
          {canExport && (
            <span className="text-[10px] text-zinc-500">CSS · Tailwind · tokens.json</span>
          )}
          <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${
            canExport ? 'bg-green-100 text-green-800' : 'bg-zinc-100 text-zinc-500'
          }`}>
            {canExport ? 'Verfügbar' : 'Nicht verfügbar'}
          </span>
        </span>
      </div>

      {warnings.length > 0 && (
        <div className="border border-amber-200 bg-amber-50 rounded-lg p-3">
          <div className="text-xs font-semibold text-amber-800 mb-1">Hinweise</div>
          <ul className="list-disc list-inside text-[11px] text-amber-800">
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
