// API-kompatibler Stub (kein Radix) — Klassen wie shadcn/ui new-york.
export function ToggleGroup({ className = '', ...props }) {
  return <div className={`flex items-center justify-center gap-1 ${className}`.trim()} {...props} />;
}

export function ToggleGroupItem({ variant = 'default', className = '', ...props }) {
  const look = variant === 'outline' ? 'border border-input bg-transparent' : 'bg-transparent';
  return <button type="button" className={`inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium ${look} ${className}`.trim()} {...props} />;
}
