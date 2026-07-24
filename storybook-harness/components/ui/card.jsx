export function Card({ className = '', ...props }) {
  return <div className={`rounded-lg border bg-card text-card-foreground shadow-sm ${className}`.trim()} {...props} />;
}
export function CardHeader({ className = '', ...props }) {
  return <div className={`flex flex-col space-y-1.5 p-6 ${className}`.trim()} {...props} />;
}
export function CardContent({ className = '', ...props }) {
  return <div className={`p-6 pt-0 ${className}`.trim()} {...props} />;
}
export function CardFooter({ className = '', ...props }) {
  return <div className={`flex items-center p-6 pt-0 ${className}`.trim()} {...props} />;
}
