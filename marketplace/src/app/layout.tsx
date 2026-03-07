import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Detectiv Marketplace Mock',
  description: 'Discover and share AI agent datasets, skills, and memories',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">{children}</body>
    </html>
  );
}
