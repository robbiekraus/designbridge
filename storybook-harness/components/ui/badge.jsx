const VARIANTS = {
  default: 'bg-primary text-primary-foreground',
  secondary: 'bg-secondary text-secondary-foreground',
  destructive: 'bg-destructive text-destructive-foreground',
  outline: 'text-foreground border border-input',
};

export function Badge({ variant = 'default', className = '', ...props }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${VARIANTS[variant] || VARIANTS.default} ${className}`.trim()} {...props} />;
}
