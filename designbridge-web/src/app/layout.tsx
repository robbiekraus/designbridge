import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DesignBridge',
  description: 'Design system dashboard — tokens, components, sync status',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 min-h-screen">
        <header className="border-b border-gray-800 px-6 py-4 flex items-center gap-6">
          <span className="font-semibold tracking-tight text-white text-lg">DesignBridge</span>
          <nav className="flex gap-4 text-sm text-gray-400">
            <a href="/" className="hover:text-white transition-colors">Overview</a>
            <a href="/components" className="hover:text-white transition-colors">Components</a>
            <a href="/tokens" className="hover:text-white transition-colors">Tokens</a>
          </nav>
        </header>
        <main className="px-6 py-8 max-w-7xl mx-auto">{children}</main>
      </body>
    </html>
  );
}
