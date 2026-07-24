export function Avatar({ className = '', ...props }) {
  return <span className={`relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted ${className}`.trim()} {...props} />;
}
