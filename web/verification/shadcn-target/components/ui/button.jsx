// Reales, API-kompatibles shadcn/ui Button-Stub für den Grounding-Verifikations-Harness (Scheibe 1
// Schritt 6). Öffentliche API (Props variant/size/className/children) entspricht shadcn/ui — echte
// Radix-/cva-Abhängigkeiten sind für den Kompilier-/Render-Beweis nicht nötig.
const VARIANTS = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/90',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  outline: 'border border-input bg-background hover:bg-accent',
  ghost: 'hover:bg-accent hover:text-accent-foreground',
  link: 'text-primary underline-offset-4 hover:underline',
};
const SIZES = { default: 'h-10 px-4 py-2', sm: 'h-9 px-3', lg: 'h-11 px-8', icon: 'h-10 w-10' };

export function Button({ variant = 'default', size = 'default', className = '', ...props }) {
  const cls = `inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors ${VARIANTS[variant] || VARIANTS.default} ${SIZES[size] || SIZES.default} ${className}`;
  return <button className={cls.trim()} {...props} />;
}
