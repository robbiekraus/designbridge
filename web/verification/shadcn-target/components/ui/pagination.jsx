// API-kompatibler Stub (kein Radix) — Klassen wie shadcn/ui new-york.
export function Pagination({ className = '', ...props }) {
  return <nav role="navigation" aria-label="pagination" className={`mx-auto flex w-full justify-center ${className}`.trim()} {...props} />;
}

export function PaginationContent({ className = '', ...props }) {
  return <ul className={`flex flex-row items-center gap-1 ${className}`.trim()} {...props} />;
}

export function PaginationItem({ className = '', ...props }) {
  return <li className={className.trim()} {...props} />;
}

export function PaginationLink({ isActive = false, className = '', ...props }) {
  const look = isActive ? 'border border-input' : '';
  return <a className={`inline-flex h-9 w-9 items-center justify-center rounded-md text-sm font-medium ${look} ${className}`.trim()} {...props} />;
}
