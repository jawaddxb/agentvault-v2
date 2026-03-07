'use client';

import { useState } from 'react';
import { KeyRound, Trash2, Copy, Check } from 'lucide-react';

interface ApiKeyRowProps {
  id: number;
  prefix: string;
  fullKey: string;
  label: string;
  createdAt: string;
  revoked: boolean;
  onRevoke: (id: number) => void;
}

export default function ApiKeyRow({ id, prefix, fullKey, label, createdAt, revoked, onRevoke }: ApiKeyRowProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(fullKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`flex items-center justify-between p-3 bg-[var(--bg-card)] rounded-lg border border-[var(--border)] ${revoked ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-3">
        <KeyRound className="w-4 h-4 text-[var(--accent)]" />
        <div>
          <div className="flex items-center gap-2">
            <code className="text-sm font-mono">{prefix}...</code>
            <span className="text-xs text-[var(--text-secondary)]">({label})</span>
          </div>
          <div className="text-xs text-[var(--text-secondary)]">
            Created {new Date(createdAt).toLocaleDateString()}
            {revoked && <span className="ml-2 text-[var(--danger)]">Revoked</span>}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {!revoked && (
          <button
            onClick={handleCopy}
            className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10 rounded-lg transition-colors"
            title="Copy full API key"
          >
            {copied ? <Check className="w-4 h-4 text-[var(--success)]" /> : <Copy className="w-4 h-4" />}
          </button>
        )}
        {!revoked && (
          <button
            onClick={() => onRevoke(id)}
            className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--danger)] hover:bg-red-500/10 rounded-lg transition-colors"
            title="Revoke key"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
