// API-kompatibler Stub (kein Radix) — Klassen wie shadcn/ui new-york.
export function Tabs({ className = '', ...props }) {
  return <div className={className.trim()} {...props} />;
}

export function TabsList({ className = '', ...props }) {
  return <div className={`inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground ${className}`.trim()} {...props} />;
}

export function TabsTrigger({ className = '', ...props }) {
  return <button type="button" className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ${className}`.trim()} {...props} />;
}

export function TabsContent({ className = '', ...props }) {
  return <div className={`mt-2 ${className}`.trim()} {...props} />;
}
