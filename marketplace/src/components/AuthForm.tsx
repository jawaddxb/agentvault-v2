'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Shield, ArrowLeft } from 'lucide-react';

interface AuthFormProps {
  mode: 'login' | 'register';
}

export default function AuthForm({ mode }: AuthFormProps) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
    const body = mode === 'login' ? { email, password } : { username, email, password };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong');
        return;
      }

      if (mode === 'register') {
        router.push('/auth/login?registered=1');
      } else {
        router.push('/marketplace');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-sm p-6 bg-[var(--bg-card)] rounded-xl border border-[var(--border)]">
        <div className="flex items-center justify-center gap-2 mb-6">
          <Shield className="w-6 h-6 text-[var(--accent)]" />
          <h1 className="text-xl font-semibold">{mode === 'login' ? 'Sign In' : 'Create Account'}</h1>
        </div>

        {error && (
          <div className="mb-4 p-2 text-sm text-[var(--danger)] bg-red-500/10 rounded-lg border border-red-500/20">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {mode === 'register' && (
            <input type="text" placeholder="Display Name" value={username} onChange={e => setUsername(e.target.value)} required />
          )}
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} minLength={6} required />
          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full py-2 bg-[var(--accent)] text-white rounded-lg font-medium hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {loading ? 'Loading...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-[var(--text-secondary)]">
          {mode === 'login' ? (
            <>No account? <Link href="/auth/register" className="text-[var(--accent)] hover:underline">Sign up</Link></>
          ) : (
            <>Have an account? <Link href="/auth/login" className="text-[var(--accent)] hover:underline">Sign in</Link></>
          )}
        </p>

        <Link href="/marketplace" className="mt-3 flex items-center justify-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Marketplace
        </Link>
      </div>
    </div>
  );
}
