export function Separator({ className = '', orientation = 'horizontal', ...props }) {
  const dim = orientation === 'vertical' ? 'h-full w-px' : 'h-px w-full';
  return <div role="separator" className={`shrink-0 bg-border ${dim} ${className}`.trim()} {...props} />;
}
