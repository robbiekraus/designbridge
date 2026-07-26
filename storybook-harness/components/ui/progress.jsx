// API-kompatibler Stub (kein Radix) — Klassen wie shadcn/ui new-york.
export function Progress({ value = 0, className = '', ...props }) {
  const pct = Math.min(100, Math.max(0, Number(value) || 0));
  return (
    <div className={`relative h-2 w-full overflow-hidden rounded-full bg-secondary ${className}`.trim()} {...props}>
      <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}
