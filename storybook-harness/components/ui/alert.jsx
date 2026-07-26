// API-kompatibler Stub (kein Radix) — Klassen wie shadcn/ui new-york.
const VARIANTS = {
  default: 'bg-background text-foreground',
  destructive: 'border-destructive/50 text-destructive',
};

export function Alert({ variant = 'default', className = '', ...props }) {
  return <div role="alert" className={`relative w-full rounded-lg border p-4 ${VARIANTS[variant] || VARIANTS.default} ${className}`.trim()} {...props} />;
}

export function AlertTitle({ className = '', ...props }) {
  return <h5 className={`mb-1 font-medium leading-none tracking-tight ${className}`.trim()} {...props} />;
}

export function AlertDescription({ className = '', ...props }) {
  return <div className={`text-sm [&_p]:leading-relaxed ${className}`.trim()} {...props} />;
}
