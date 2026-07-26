// API-kompatibler Stub (kein Radix) — Klassen wie shadcn/ui new-york.
export function Breadcrumb({ className = '', ...props }) {
  return <nav aria-label="breadcrumb" className={className.trim()} {...props} />;
}

export function BreadcrumbList({ className = '', ...props }) {
  return <ol className={`flex flex-wrap items-center gap-1.5 break-words text-sm text-muted-foreground ${className}`.trim()} {...props} />;
}

export function BreadcrumbItem({ className = '', ...props }) {
  return <li className={`inline-flex items-center gap-1.5 ${className}`.trim()} {...props} />;
}

export function BreadcrumbSeparator({ className = '', ...props }) {
  return <li role="presentation" aria-hidden="true" className={className.trim()} {...props} />;
}

export function BreadcrumbPage({ className = '', ...props }) {
  return <span role="link" aria-disabled="true" className={`font-normal text-foreground ${className}`.trim()} {...props} />;
}
