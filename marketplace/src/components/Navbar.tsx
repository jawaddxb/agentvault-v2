'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Shield, LogOut, User } from 'lucide-react';

interface UserInfo {
  id: number;
  username: string;
  email: string;
}

export default function Navbar() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(setUser).catch(() => null);
  }, []);

  const handleLogout = async () => {
    document.cookie = 'av_session=; path=/; max-age=0';
    setUser(null);
    router.push('/auth/login');
  };

  return (
    <nav className="border-b border-[var(--border)] px-6 py-3 flex items-center justify-between">
      <Link href="/marketplace" className="flex items-center gap-2 font-semibold text-lg">
        <Shield className="w-5 h-5 text-[var(--accent)]" />
        <span>Detectiv Marketplace Mock</span>
      </Link>
      <div className="flex items-center gap-4">
        {user ? (
          <>
            <span className="text-sm text-[var(--text-secondary)] flex items-center gap-1">
              <User className="w-4 h-4" /> {user.username}
            </span>
            <button onClick={handleLogout} className="text-sm text-[var(--text-secondary)] hover:text-[var(--danger)] flex items-center gap-1">
              <LogOut className="w-4 h-4" /> Logout
            </button>
          </>
        ) : (
          <>
            <Link href="/auth/login" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Login</Link>
            <Link href="/auth/register" className="text-sm px-3 py-1 bg-[var(--accent)] text-white rounded-lg hover:bg-[var(--accent-hover)]">Sign Up</Link>
          </>
        )}
      </div>
    </nav>
  );
}
