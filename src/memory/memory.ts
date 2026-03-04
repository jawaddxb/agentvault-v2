import fs from 'node:fs';
import lockfile from 'proper-lockfile';
import { resolvePaths } from '../config/paths.js';
import { getPassphrase, readEncryptedFile, writeEncryptedFile } from '../vault/encryption.js';
import { MEMORY_MAX_ENTRIES, MEMORY_MAX_BYTES, MEMORY_WARN_PERCENT } from '../config/defaults.js';
import { extractKeywords, computeQueryHash, searchMemories } from './search.js';
import { memoryMutex } from './mutex.js';
import { validateKey, validateMemoryContent, validateTags } from '../config/validate.js';
import type { MemoryEntry, MemoryType } from '../types/index.js';
import type { SearchResponse } from './search.js';

function ensureDir(projectDir: string): void {
  const { base } = resolvePaths(projectDir);
  fs.mkdirSync(base, { recursive: true });
}

function checkLimits(entries: MemoryEntry[]): void {
  const size = Buffer.byteLength(JSON.stringify(entries), 'utf-8');
  if (entries.length >= MEMORY_MAX_ENTRIES) {
    throw new Error(`Memory full: ${entries.length}/${MEMORY_MAX_ENTRIES} entries`);
  }
  if (size >= MEMORY_MAX_BYTES) {
    throw new Error(`Memory full: ${size} bytes exceeds ${MEMORY_MAX_BYTES} byte limit`);
  }
  if (entries.length >= MEMORY_MAX_ENTRIES * MEMORY_WARN_PERCENT) {
    console.warn(`Warning: memory at ${Math.round((entries.length / MEMORY_MAX_ENTRIES) * 100)}% capacity`);
  }
}

/** Load all memory entries (decrypted) */
export function loadMemories(projectDir: string): MemoryEntry[] {
  const { memory: memPath } = resolvePaths(projectDir);
  const passphrase = getPassphrase(projectDir);
  return readEncryptedFile<MemoryEntry[]>(memPath, passphrase, []);
}

/** Save all memory entries (encrypted) */
export function saveMemories(projectDir: string, entries: MemoryEntry[]): void {
  ensureDir(projectDir);
  const { memory: memPath } = resolvePaths(projectDir);
  const passphrase = getPassphrase(projectDir);
  writeEncryptedFile(memPath, entries, passphrase);
}

/** Store a memory entry with mutex + file locking */
export async function storeMemory(
  projectDir: string,
  opts: {
    key: string;
    content: string;
    memoryType: MemoryType;
    tags?: string[];
    keywords?: string[];
    confidence?: number;
    source?: string;
    ttlSeconds?: number;
    queryHash?: string;
  }
): Promise<MemoryEntry> {
  validateKey(opts.key, 'Memory key');
  validateMemoryContent(opts.content);
  if (opts.tags) validateTags(opts.tags);

  return memoryMutex.runExclusive(() => {
    ensureDir(projectDir);
    const { memory: memPath, base } = resolvePaths(projectDir);
    const release = lockfile.lockSync(base, { lockfilePath: memPath + '.lock' });
    try {
      const entries = loadMemories(projectDir);
      const now = new Date().toISOString();
      // Auto-extract keywords from content, merge with user-provided keywords AND tags
      const autoKeywords = extractKeywords(opts.content);
      const userKeywords = (opts.keywords ?? []).map(k => k.toLowerCase().trim()).filter(k => k.length > 0);
      const tagKeywords = (opts.tags ?? []).map(t => t.toLowerCase().trim()).filter(t => t.length > 0);
      const keywords = [...new Set([...autoKeywords, ...userKeywords, ...tagKeywords])];
      const qHash = opts.queryHash ?? undefined;

      // Check for same key → overwrite
      const idx = entries.findIndex(e => e.key === opts.key);

      const entry: MemoryEntry = {
        key: opts.key,
        vaultType: 'memory',
        memoryType: opts.memoryType,
        tags: opts.tags ?? [],
        queryHash: qHash,
        keywords,
        content: opts.content,
        confidence: opts.confidence ?? 0.8,
        source: opts.source,
        expiresAt: opts.ttlSeconds
          ? new Date(Date.now() + opts.ttlSeconds * 1000).toISOString()
          : undefined,
        accessCount: 0,
        addedAt: now,
      };

      if (idx >= 0) {
        entries[idx] = entry;
      } else {
        checkLimits(entries);
        entries.push(entry);
      }

      saveMemories(projectDir, entries);
      return entry;
    } finally {
      release();
    }
  });
}

/** Query memories with keyword search */
export async function queryMemories(
  projectDir: string,
  query: string,
  limit: number = 10
): Promise<SearchResponse> {
  return memoryMutex.runExclusive(() => {
    const { memory: memPath, base } = resolvePaths(projectDir);
    ensureDir(projectDir);
    const release = lockfile.lockSync(base, { lockfilePath: memPath + '.lock' });
    try {
      const entries = loadMemories(projectDir);
      // Filter out expired entries
      const now = Date.now();
      const active = entries.filter(e => !e.expiresAt || new Date(e.expiresAt).getTime() > now);

      const response = searchMemories(active, query, limit);

      // Increment access counts for returned results
      if (response.results.length > 0) {
        for (const r of response.results) {
          const idx = entries.findIndex(e => e.key === r.entry.key);
          if (idx >= 0) entries[idx].accessCount++;
        }
        saveMemories(projectDir, entries);
      }

      return response;
    } finally {
      release();
    }
  });
}

/** List all memory entries (metadata only, no content) */
export async function listMemories(
  projectDir: string,
  opts?: { tag?: string; memoryType?: MemoryType }
): Promise<Array<Omit<MemoryEntry, 'content'> & { contentLength: number }>> {
  return memoryMutex.runExclusive(() => {
    const entries = loadMemories(projectDir);
    let filtered = entries;

    if (opts?.tag) {
      filtered = filtered.filter(e => e.tags.includes(opts.tag!));
    }
    if (opts?.memoryType) {
      filtered = filtered.filter(e => e.memoryType === opts.memoryType);
    }

    return filtered.map(e => {
      const { content, ...rest } = e;
      return { ...rest, contentLength: content.length };
    });
  });
}

/** Remove a memory entry by key */
export async function removeMemory(projectDir: string, key: string): Promise<boolean> {
  return memoryMutex.runExclusive(() => {
    ensureDir(projectDir);
    const { memory: memPath, base } = resolvePaths(projectDir);
    const release = lockfile.lockSync(base, { lockfilePath: memPath + '.lock' });
    try {
      const entries = loadMemories(projectDir);
      const idx = entries.findIndex(e => e.key === key);
      if (idx < 0) return false;
      entries.splice(idx, 1);
      saveMemories(projectDir, entries);
      return true;
    } finally {
      release();
    }
  });
}

/** Export all memories (decrypted) */
export async function exportMemories(projectDir: string): Promise<MemoryEntry[]> {
  return memoryMutex.runExclusive(() => {
    return loadMemories(projectDir);
  });
}
