import React from 'react';
import LibraryObjectList from '../components/library/LibraryObjectList.jsx';
import { emitComponents } from '../lib/emit/emitComponents.js';
import { normalizeTokens } from '../lib/emit/normalizeTokens.js';
import { pickTokens } from '../lib/emit/pickTokens.js';

export default function Patterns({ result, onRetryInterpret }) {
  if (!result?.raw) {
    return <div className="text-sm text-zinc-500">Preview-Import — keine Detaildaten. Importiere ein Bild, um Patterns als Code zu sehen.</div>;
  }
  const items = emitComponents(result, 'pattern');
  const picks = pickTokens(normalizeTokens(result.raw.tokens));
  return <LibraryObjectList items={items} picks={picks} onRetryInterpret={onRetryInterpret} />;
}
