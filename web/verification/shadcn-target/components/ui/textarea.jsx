// API-kompatibler Stub (kein Radix) — Klassen wie shadcn/ui new-york.
// Wie das echte shadcn-Textarea ein natives <textarea>: ein Element, das in React KEINE Children
// verträgt (Wert läuft über value/defaultValue). Deshalb trägt der Katalog-Eintrag voidElement:true.
export function Textarea({ className = '', ...props }) {
  return <textarea className={`flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ${className}`.trim()} {...props} />;
}
