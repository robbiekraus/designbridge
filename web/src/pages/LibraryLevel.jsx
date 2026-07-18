import React from 'react';
import LibraryObjectList from '../components/library/LibraryObjectList.jsx';
import { emitComponents } from '../lib/emit/emitComponents.js';
import { normalizeTokens } from '../lib/emit/normalizeTokens.js';
import { pickTokens } from '../lib/emit/pickTokens.js';

// Generische Library-Ebenen-Seite (ersetzt die vormals fast identischen
// Atomics.jsx/Components.jsx/Patterns.jsx) — eine Komponente für alle vier
// Atomic-Design-Ebenen, unterschieden nur über `kind` (Filter für
// emitComponents) und `title` (Anzeige-Name in der Leer-Meldung).
export default function LibraryLevel({ result, kind, title, onRetryInterpret, retryingNames }) {
  if (!result?.raw) {
    return (
      <div className="text-sm text-zinc-500">
        Preview-Import — keine Detaildaten. Importiere ein Bild, um {title} als Code zu sehen.
      </div>
    );
  }
  const items = emitComponents(result, kind);
  const picks = pickTokens(normalizeTokens(result.raw.tokens));
  return (
    <LibraryObjectList
      items={items}
      picks={picks}
      onRetryInterpret={onRetryInterpret}
      retryingNames={retryingNames}
      batchPending={result?.interpretPending ?? false}
      interpretError={result?.interpretError ?? null}
      quotaExhausted={result?.interpretQuotaExhausted ?? false}
    />
  );
}
