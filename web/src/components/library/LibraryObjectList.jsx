import React, { useState } from 'react';
import ConfidencePill from './ConfidencePill.jsx';
import SourcePill from './SourcePill.jsx';
import GroundedPill from './GroundedPill.jsx';
import PreviewPlaceholder from './PreviewPlaceholder.jsx';
import InterpretedPreview from './InterpretedPreview.jsx';
import { PREVIEWS } from '../../lib/components/templates/Previews.jsx';
import { downloadFile } from '../../lib/download.js';

// Fix 1 (Testrunde 6): Fallback-Text, wenn die Tages-Quota erschöpft ist, aber
// der Server (noch) keine eigene Fehlermeldung mitgeliefert hat.
const QUOTA_FALLBACK_MESSAGE = 'Tages-Kontingent der KI ist aufgebraucht — Reset ca. 09:00 deutscher Zeit.';

// Fix 2 (Testrunde 6): CSS-only Spinner (kein neues Package) — im zinc-Stil,
// wiederverwendet im Header, im Detail-Status und in der PreviewPlaceholder.
function Spinner({ className = '' }) {
  return (
    <span
      role="status"
      aria-label="lädt"
      className={`inline-block h-3 w-3 rounded-full border-2 border-zinc-300 border-t-zinc-600 animate-spin ${className}`}
    />
  );
}

// Header-Meta: Name, Confidence-Pille, Source-Pillen, Stub-Chip, Aktivitäts-
// Pille, Dateiname — identische Bausteine in beiden Layouts (Akkordeon &
// Preview-First), nur die Umgebung (Button vs. div) unterscheidet sich.
function HeaderMeta({ item, showActivityPill }) {
  return (
    <>
      <span className="font-medium text-zinc-900">{item.name}</span>
      <ConfidencePill value={item.confidence} />
      <SourcePill value={item.source} />
      <GroundedPill names={item.grounded} />
      {item.lifted && <SourcePill value="lifted" />}
      {item.interpretedHtml && <SourcePill value="interpreted" />}
      {item.interpretedDemo && <SourcePill value="demo" />}
      {item.interpretedHtml && !item.interpretedDemo && item.interpretedModel && (
        <span className="text-[10px] font-mono text-zinc-400">{item.interpretedModel}</span>
      )}
      {!item.hasPreview && !item.interpretedHtml && !item.interpretPending && !item.interpretFailed && !item.lifted && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500">
          generischer Stub
        </span>
      )}
      {showActivityPill && (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600">
          <Spinner />
          interpretiert …
        </span>
      )}
    </>
  );
}

function VariantSwitcher({ variants, variant, setVariant }) {
  if (!variants || variants.length === 0) return null;
  return (
    <div className="flex gap-1 flex-wrap">
      {variants.map((v) => (
        <button
          key={v}
          onClick={() => setVariant(v)}
          className={`text-[11px] px-2 py-0.5 rounded ${
            variant === v ? 'bg-primary text-white' : 'bg-zinc-100 text-zinc-600'
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

// Vorschau-Inhalt (Regel-Preview / interpretiertes HTML / Platzhalter) —
// identisch für beide Layouts.
function PreviewBody({ item, picks, variant, retrying }) {
  const Preview = item.hasPreview ? PREVIEWS[item.templateKey] : null;
  if (Preview) return <Preview variant={variant} picks={picks} name={item.name} />;
  if (item.interpretedHtml) {
    return (
      <div className="w-full">
        <InterpretedPreview html={item.interpretedHtml} title={item.name} />
      </div>
    );
  }
  if (retrying) return <PreviewPlaceholder label="Wird interpretiert …" spinner />;
  if (item.interpretPending) return <PreviewPlaceholder label="Wird interpretiert …" />;
  return <PreviewPlaceholder label="keine Vorschau" />;
}

// Retry-/Fehler-Zeile unter der Vorschau — identisch für beide Layouts.
function RetryStatus({ item, onRetryInterpret, retrying, batchPending, interpretError, quotaExhausted }) {
  const quotaTitle = quotaExhausted ? (interpretError || QUOTA_FALLBACK_MESSAGE) : undefined;
  const retryDisabled = retrying || batchPending || quotaExhausted;

  return (
    <>
      {item.lifted && !item.hasPreview && !item.interpretedHtml && !item.interpretPending && !item.interpretFailed && onRetryInterpret && (
        <div className="pt-2">
          <button
            onClick={() => onRetryInterpret(item.name)}
            disabled={retryDisabled}
            title={quotaTitle}
            className="text-[11px] px-2 py-0.5 rounded border border-zinc-200 text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {retrying ? 'Läuft …' : 'Mit KI interpretieren'}
          </button>
        </div>
      )}
      {item.interpretFailed && (
        <div className="flex items-center gap-2 pt-2 text-[11px] text-zinc-500">
          {retrying && <Spinner />}
          <span>
            {retrying
              ? 'Wird erneut interpretiert …'
              : batchPending
                ? 'Interpretation läuft noch — Retry gleich möglich …'
                : quotaExhausted
                  ? (interpretError || QUOTA_FALLBACK_MESSAGE)
                  : interpretError
                    ? `Interpretation fehlgeschlagen: ${interpretError}`
                    : 'Interpretation fehlgeschlagen.'}
          </span>
          {onRetryInterpret && (
            <button
              onClick={() => onRetryInterpret(item.name)}
              disabled={retryDisabled}
              title={quotaTitle}
              className="text-[11px] px-2 py-0.5 rounded border border-zinc-200 text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {retrying ? 'Läuft …' : 'Erneut versuchen'}
            </button>
          )}
        </div>
      )}
    </>
  );
}

// Code-Bereich hinter dem „Code anzeigen"-Toggle — Kopieren/Herunterladen
// gehören nur hierher, wie im Spec gefordert. Die Notiz (item.notes, z.B.
// Herkunftsvermerk) sitzt links neben dem Toggle, statt auf eigener Zeile
// über dem Inhalt (Rob-Feedback 2026-07-20, dritte Runde).
function CodeToggle({ item }) {
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(item.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="pt-2">
      <div className="flex items-center justify-between gap-2">
        {item.notes ? (
          <div className="flex items-start gap-1 text-[11px] italic text-zinc-500 min-w-0">
            <span aria-hidden="true">✎</span>
            <span className="truncate">{item.notes}</span>
          </div>
        ) : (
          <span />
        )}
        <button
          onClick={() => setShowCode((s) => !s)}
          className="flex-shrink-0 text-[11px] px-2 py-0.5 rounded border border-zinc-200 text-zinc-700 hover:bg-zinc-50"
        >
          {showCode ? 'Code verbergen' : 'Code anzeigen'}
        </button>
      </div>

      {showCode && (
        <div className="pt-2">
          <pre className="text-xs font-mono bg-white border border-zinc-200 rounded p-3 overflow-auto max-h-72 whitespace-pre">
            {item.code}
          </pre>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[10px] font-mono text-zinc-400">{item.filename}</span>
            {copied && <span className="text-[10px] text-emerald-600">kopiert</span>}
            <span className="ml-auto" />
            <button
              onClick={copy}
              className="text-xs px-2.5 py-1 rounded border border-zinc-200 text-zinc-700 hover:bg-zinc-50"
            >
              Kopieren
            </button>
            <button
              onClick={() => downloadFile(item.filename, item.code, 'text/javascript')}
              className="text-xs px-2.5 py-1 rounded bg-primary text-white font-medium hover:bg-primary-hover"
            >
              Herunterladen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Heutige Akkordeon-Zeile, unverändert für kind === 'template' (und Fallback
// wenn kein `kind` übergeben wird — Rückwärtskompatibilität für Aufrufer, die
// die Prop (noch) nicht setzen).
function TemplateRow({ item, picks, onRetryInterpret, retrying, batchPending, interpretError, quotaExhausted }) {
  const [open, setOpen] = useState(false);
  const [variant, setVariant] = useState(item.variants[0] ?? null);
  const showActivityPill = retrying || (batchPending && !item.interpretedHtml && !item.hasPreview);

  return (
    <div className="border-b border-zinc-200">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm hover:bg-zinc-50"
      >
        <span className={`text-zinc-400 transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
        <HeaderMeta item={item} showActivityPill={showActivityPill} />
        <span className="ml-auto text-[10px] font-mono text-zinc-400">{item.filename}</span>
      </button>

      {open && (
        <div className="bg-zinc-50 px-3 pb-3">
          <div className="py-2">
            <VariantSwitcher variants={item.variants} variant={variant} setVariant={setVariant} />
          </div>
          {item.notes && (
            <div className="flex items-start gap-1 text-[11px] italic text-zinc-500 pt-1">
              <span aria-hidden="true">✎</span>
              <span>{item.notes}</span>
            </div>
          )}

          <div className="text-[9px] uppercase tracking-wider text-zinc-400 pt-1 pb-1.5">Vorschau</div>
          <div className="flex items-center gap-2 flex-wrap p-3 bg-white border border-zinc-200 rounded">
            <PreviewBody item={item} picks={picks} variant={variant} retrying={retrying} />
          </div>
          <RetryStatus
            item={item}
            onRetryInterpret={onRetryInterpret}
            retrying={retrying}
            batchPending={batchPending}
            interpretError={interpretError}
            quotaExhausted={quotaExhausted}
          />

          <div className="text-[9px] uppercase tracking-wider text-zinc-400 pt-3 pb-1.5">Code</div>
          <CodeInline item={item} />
        </div>
      )}
    </div>
  );
}

// Der Templates-Code-Block bleibt immer offen (kein Toggle) — genau wie vor
// dem Umbau. Eigene, kleine Komponente statt CodeToggle, damit das Template-
// Verhalten unangetastet bleibt.
function CodeInline({ item }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(item.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <>
      <pre className="text-xs font-mono bg-white border border-zinc-200 rounded p-3 overflow-auto max-h-72 whitespace-pre">
        {item.code}
      </pre>
      <div className="flex items-center gap-2 mt-2">
        <span className="text-[10px] font-mono text-zinc-400">{item.filename}</span>
        {copied && <span className="text-[10px] text-emerald-600">kopiert</span>}
        <span className="ml-auto" />
        <button
          onClick={copy}
          className="text-xs px-2.5 py-1 rounded border border-zinc-200 text-zinc-700 hover:bg-zinc-50"
        >
          Kopieren
        </button>
        <button
          onClick={() => downloadFile(item.filename, item.code, 'text/javascript')}
          className="text-xs px-2.5 py-1 rounded bg-primary text-white font-medium hover:bg-primary-hover"
        >
          Herunterladen
        </button>
      </div>
    </>
  );
}

// Preview-First-Zeile — geteilt von atom/molecule/organism (Rob-Feedback
// 2026-07-20, dritte Runde): eine Zeilen-Komponente für alle drei Ebenen,
// je eine volle-Breite-Zeile. Vorschau + Varianten-Umschalter immer sichtbar,
// nur Code hinter Toggle. Notiz sitzt in der Code-Toggle-Zeile (siehe
// CodeToggle), nicht mehr separat über dem Inhalt.
function PreviewFirstRow({ item, picks, onRetryInterpret, retrying, batchPending, interpretError, quotaExhausted }) {
  const [variant, setVariant] = useState(item.variants[0] ?? null);
  const showActivityPill = retrying || (batchPending && !item.interpretedHtml && !item.hasPreview);

  return (
    <div className="border border-zinc-200 rounded-lg p-3 bg-white flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <HeaderMeta item={item} showActivityPill={showActivityPill} />
        <span className="ml-auto text-[10px] font-mono text-zinc-400">{item.filename}</span>
      </div>

      <VariantSwitcher variants={item.variants} variant={variant} setVariant={setVariant} />

      <div className="flex items-center gap-2 flex-wrap p-3 bg-white border border-zinc-200 rounded">
        <PreviewBody item={item} picks={picks} variant={variant} retrying={retrying} />
      </div>

      <RetryStatus
        item={item}
        onRetryInterpret={onRetryInterpret}
        retrying={retrying}
        batchPending={batchPending}
        interpretError={interpretError}
        quotaExhausted={quotaExhausted}
      />

      <CodeToggle item={item} />
    </div>
  );
}

const PREVIEW_FIRST_LIST_CLASS = 'flex flex-col gap-4';

export default function LibraryObjectList({
  items,
  picks,
  kind,
  onRetryInterpret,
  retryingNames,
  batchPending,
  interpretError,
  quotaExhausted,
}) {
  if (!items || items.length === 0) {
    return <div className="text-sm text-zinc-500">Keine Objekte erkannt.</div>;
  }

  const sharedProps = (item) => ({
    item,
    picks,
    onRetryInterpret,
    retrying: retryingNames?.has(item.name) ?? false,
    batchPending,
    interpretError,
    quotaExhausted,
  });

  // Templates bleiben unverändert die heutige Akkordeon-Liste. Ohne `kind`
  // (Rückwärtskompatibilität / ältere Aufrufer) gilt derselbe Pfad.
  if (!kind || kind === 'template') {
    return (
      <div className="max-w-3xl border-t border-zinc-200">
        {items.map((item) => (
          <TemplateRow key={item.slug + item.kind} {...sharedProps(item)} />
        ))}
      </div>
    );
  }

  // atom/molecule/organism teilen sich dieselbe Preview-First-Zeilen-Liste —
  // eine volle-Breite-Zeile pro Item, Vorschau immer sichtbar.
  return (
    <div className={PREVIEW_FIRST_LIST_CLASS}>
      {items.map((item) => (
        <PreviewFirstRow key={item.slug + item.kind} {...sharedProps(item)} />
      ))}
    </div>
  );
}
