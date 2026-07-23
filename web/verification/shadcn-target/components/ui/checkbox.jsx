export function Checkbox({ className = '', checked, ...props }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked ? 'true' : 'false'}
      data-state={checked ? 'checked' : 'unchecked'}
      className={`h-4 w-4 shrink-0 rounded-sm border border-primary ${className}`.trim()}
      {...props}
    />
  );
}
