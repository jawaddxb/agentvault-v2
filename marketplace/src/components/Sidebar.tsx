'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, Upload, Database, Key, Users, BookOpen } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/marketplace', label: 'Browse', icon: Search },
  { href: '/marketplace/upload', label: 'Upload Dataset', icon: Upload },
  { href: '/marketplace/my-datasets', label: 'My Datasets', icon: Database },
  { href: '/marketplace/api-keys', label: 'API Keys', icon: Key },
  { href: '/marketplace/users', label: 'Users', icon: Users },
  { href: '/marketplace/docs', label: 'API Docs', icon: BookOpen },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 border-r border-[var(--border)] p-4 flex flex-col gap-1">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              active
                ? 'bg-[var(--accent)] text-white'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </Link>
        );
      })}
    </aside>
  );
}
