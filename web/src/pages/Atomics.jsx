import React from 'react';
import LibraryObjectList from '../components/library/LibraryObjectList.jsx';
import { emitComponents } from '../lib/emit/emitComponents.js';
import { normalizeTokens } from '../lib/emit/normalizeTokens.js';
import { pickTokens } from '../lib/emit/pickTokens.js';

export default function Atomics({ result, onRetryInterpret, retryingNames }) {
  if (!result?.raw) {
    return <div className="text-sm text-zinc-500">Preview-Import — keine Detaildaten. Importiere ein Bild, um Atomics als Code zu sehen.</div>;
  }
  const items = emitComponents(result, 'atomic');
  const picks = pickTokens(normalizeTokens(result.raw.tokens));
  return (
    <LibraryObjectList
      items={items}
      picks={picks}
      onRetryInterpret={onRetryInterpret}
      retryingNames={retryingNames}
      batchPending={result?.interpretPending ?? false}
    />
  );
}
