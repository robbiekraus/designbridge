// API-kompatibler Stub (kein Radix) — Klassen wie shadcn/ui new-york.
export function Switch({ checked = false, className = '', ...props }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent p-0.5 ${checked ? 'bg-primary' : 'bg-input'} ${className}`.trim()}
      {...props}
    >
      <span className={`block h-5 w-5 rounded-full bg-background shadow-lg ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  );
}
