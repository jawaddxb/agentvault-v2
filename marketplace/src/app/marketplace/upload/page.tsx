'use client';

import { useState } from 'react';
import { Database, Zap } from 'lucide-react';
import UploadForm from '@/components/UploadForm';

export default function UploadPage() {
  const [uploadType, setUploadType] = useState<'dataset' | 'skill' | null>(null);

  if (!uploadType) {
    return (
      <div>
        <h1 className="text-2xl font-semibold mb-6">Upload</h1>
        <p className="text-[var(--text-secondary)] mb-6">What would you like to upload?</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
          <button
            onClick={() => setUploadType('dataset')}
            className="flex flex-col items-center gap-3 p-6 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border)] hover:border-[var(--accent)] transition-colors"
          >
            <Database className="w-8 h-8 text-[var(--accent)]" />
            <span className="font-medium">Dataset</span>
            <span className="text-xs text-[var(--text-secondary)] text-center">Knowledge, operational data, or query cache for AI agents</span>
          </button>
          <button
            onClick={() => setUploadType('skill')}
            className="flex flex-col items-center gap-3 p-6 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border)] hover:border-[var(--accent)] transition-colors"
          >
            <Zap className="w-8 h-8 text-[var(--accent)]" />
            <span className="font-medium">Skill</span>
            <span className="text-xs text-[var(--text-secondary)] text-center">Agent skills, capabilities, or encrypted memory packages</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setUploadType(null)} className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">&larr; Back</button>
        <h1 className="text-2xl font-semibold">
          Upload {uploadType === 'skill' ? 'Skill' : 'Dataset'}
        </h1>
      </div>
      <UploadForm uploadType={uploadType} />
    </div>
  );
}
