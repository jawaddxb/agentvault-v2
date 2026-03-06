'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload } from 'lucide-react';

const DATASET_CATEGORIES = [
  { value: 'knowledge', label: 'Knowledge' },
  { value: 'operational', label: 'Operational' },
  { value: 'query_cache', label: 'Query Cache' },
];

interface UploadFormProps {
  uploadType: 'dataset' | 'skill';
}

export default function UploadForm({ uploadType }: UploadFormProps) {
  const isSkill = uploadType === 'skill';
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(isSkill ? 'skills' : 'knowledge');
  const [tags, setTags] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
      const res = await fetch('/api/datasets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, category, content, tags: tagList }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to upload');
        return;
      }

      router.push('/marketplace/my-datasets');
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl flex flex-col gap-4">
      {error && (
        <div className="p-2 text-sm text-[var(--danger)] bg-red-500/10 rounded-lg border border-red-500/20">{error}</div>
      )}

      <div>
        <label className="block text-sm mb-1 text-[var(--text-secondary)]">Name</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Stripe Integration Guide" required />
      </div>

      <div>
        <label className="block text-sm mb-1 text-[var(--text-secondary)]">Description</label>
        <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief description of the dataset" />
      </div>

      {!isSkill && (
        <div>
          <label className="block text-sm mb-1 text-[var(--text-secondary)]">Category</label>
          <select value={category} onChange={e => setCategory(e.target.value)}>
            {DATASET_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
      )}

      <div>
        <label className="block text-sm mb-1 text-[var(--text-secondary)]">Tags (comma-separated)</label>
        <input type="text" value={tags} onChange={e => setTags(e.target.value)} placeholder="e.g., api, payments, stripe" />
      </div>

      <div>
        <label className="block text-sm mb-1 text-[var(--text-secondary)]">Content</label>
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder={isSkill
            ? "Paste your skill definition here — agent capabilities, tools, or encrypted memory packages..."
            : "Paste your dataset content here — knowledge, operational data, or query cache entries..."
          }
          rows={12}
          required
          className="font-mono text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="flex items-center justify-center gap-2 py-2 bg-[var(--accent)] text-white rounded-lg font-medium hover:bg-[var(--accent-hover)] disabled:opacity-50"
      >
        <Upload className="w-4 h-4" />
        {loading ? 'Uploading...' : `Upload ${isSkill ? 'Skill' : 'Dataset'}`}
      </button>
    </form>
  );
}
