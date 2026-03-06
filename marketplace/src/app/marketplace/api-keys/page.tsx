'use client';

import { useEffect, useState } from 'react';
import { Plus, Copy, Check } from 'lucide-react';
import ApiKeyRow from '@/components/ApiKeyRow';

interface ApiKey {
  id: number;
  prefix: string;
  label: string;
  createdAt: string;
  revoked: boolean;
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [copied, setCopied] = useState(false);

  const fetchKeys = () => {
    fetch('/api/api-keys')
      .then(r => r.ok ? r.json() : { keys: [] })
      .then(data => setKeys(data.keys))
      .catch(() => setKeys([]))
      .finally(() => setLoading(false));
  };

  useEffect(fetchKeys, []);

  const handleCreate = async () => {
    const res = await fetch('/api/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label }),
    });
    if (res.ok) {
      const data = await res.json();
      setNewKey(data.key);
      setLabel('');
      fetchKeys();
    }
  };

  const handleRevoke = async (id: number) => {
    await fetch('/api/api-keys', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    fetchKeys();
  };

  const handleCopy = () => {
    if (newKey) {
      navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">API Keys</h1>

      {/* New key modal */}
      {newKey && (
        <div className="mb-6 p-4 bg-green-500/10 border border-green-500/30 rounded-xl">
          <p className="text-sm text-[var(--success)] mb-2 font-medium">New API key created! Copy it now — it won&apos;t be shown again.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-sm font-mono bg-[var(--bg-secondary)] p-2 rounded-lg break-all">{newKey}</code>
            <button onClick={handleCopy} className="p-2 hover:bg-[var(--bg-card)] rounded-lg">
              {copied ? <Check className="w-4 h-4 text-[var(--success)]" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <button onClick={() => setNewKey(null)} className="mt-2 text-xs text-[var(--text-secondary)] hover:underline">Dismiss</button>
        </div>
      )}

      {/* Create key */}
      <div className="flex items-center gap-3 mb-6">
        <input
          type="text"
          placeholder="Key label (required)"
          value={label}
          onChange={e => setLabel(e.target.value)}
          className="max-w-xs"
        />
        <button
          onClick={handleCreate}
          disabled={!label.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--accent)] text-white rounded-lg hover:bg-[var(--accent-hover)] text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" /> Create Key
        </button>
      </div>

      {/* Key list */}
      {loading ? (
        <p className="text-[var(--text-secondary)]">Loading...</p>
      ) : keys.length === 0 ? (
        <p className="text-[var(--text-secondary)]">No API keys yet. Create one to access the search API.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {keys.map(k => <ApiKeyRow key={k.id} {...k} onRevoke={handleRevoke} />)}
        </div>
      )}
    </div>
  );
}
