import React from 'react';
import InventoryCard from '../components/library/InventoryCard.jsx';

export default function Atomics({ result }) {
  if (!result?.raw) {
    return <div className="text-sm text-zinc-500">Preview-Import — keine Detaildaten. Importiere ein Bild, um das UI-Inventar zu sehen.</div>;
  }
  const items = result.raw.atomics ?? [];
  return (
    <div className="max-w-3xl">
      <p className="text-xs text-zinc-400 mb-4">Visuelle Nachbauten folgen in einer späteren Phase.</p>
      <div className="grid grid-cols-3 gap-3">
        {items.map((item, i) => <InventoryCard key={i} item={item} />)}
      </div>
    </div>
  );
}
