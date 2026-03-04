import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { storeMemory, queryMemories, listMemories, removeMemory, exportMemories, loadMemories } from '../../src/memory/memory.js';

describe('memory', () => {
  let tmpDir: string;
  const originalEnv = process.env.AGENTVAULT_PASSPHRASE;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'av-mem-test-'));
    fs.mkdirSync(path.join(tmpDir, '.agentvault'), { recursive: true });
    process.env.AGENTVAULT_PASSPHRASE = 'test-memory-passphrase';
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (originalEnv !== undefined) {
      process.env.AGENTVAULT_PASSPHRASE = originalEnv;
    } else {
      delete process.env.AGENTVAULT_PASSPHRASE;
    }
  });

  it('should store and query a memory', async () => {
    await storeMemory(tmpDir, {
      key: 'webhook-setup',
      content: 'Webhook endpoint configuration for Stripe integration',
      memoryType: 'fact',
      tags: ['stripe', 'webhook'],
    });

    const response = await queryMemories(tmpDir, 'webhook stripe configuration');
    expect(response.results.length).toBeGreaterThan(0);
    expect(response.results[0].entry.key).toBe('webhook-setup');
  });

  it('should store with all options', async () => {
    const entry = await storeMemory(tmpDir, {
      key: 'pref-1',
      content: 'User prefers dark mode interface',
      memoryType: 'preference',
      tags: ['ui', 'theme'],
      confidence: 0.95,
      source: 'user-settings',
      ttlSeconds: 3600,
    });

    expect(entry.key).toBe('pref-1');
    expect(entry.memoryType).toBe('preference');
    expect(entry.confidence).toBe(0.95);
    expect(entry.expiresAt).toBeTruthy();
    expect(entry.keywords.length).toBeGreaterThan(0);
  });

  it('should overwrite by key', async () => {
    await storeMemory(tmpDir, {
      key: 'my-fact',
      content: 'Original content about database setup',
      memoryType: 'fact',
    });

    await storeMemory(tmpDir, {
      key: 'my-fact',
      content: 'Updated content about database migration',
      memoryType: 'fact',
    });

    const all = await exportMemories(tmpDir);
    expect(all.length).toBe(1);
    expect(all[0].content).toContain('Updated');
  });

  it('should list memories with metadata', async () => {
    await storeMemory(tmpDir, {
      key: 'fact-1',
      content: 'Some factual information about testing',
      memoryType: 'fact',
      tags: ['testing'],
    });

    await storeMemory(tmpDir, {
      key: 'pref-1',
      content: 'User preference for dark theme display',
      memoryType: 'preference',
      tags: ['ui'],
    });

    const all = await listMemories(tmpDir);
    expect(all).toHaveLength(2);
    // Content should not be included in list
    expect((all[0] as Record<string, unknown>)['content']).toBeUndefined();
    expect(all[0].contentLength).toBeGreaterThan(0);
  });

  it('should filter by tag', async () => {
    await storeMemory(tmpDir, {
      key: 'tagged',
      content: 'Content with testing tag applied',
      memoryType: 'fact',
      tags: ['testing'],
    });

    await storeMemory(tmpDir, {
      key: 'untagged',
      content: 'Content without testing tag applied',
      memoryType: 'fact',
      tags: ['other'],
    });

    const filtered = await listMemories(tmpDir, { tag: 'testing' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].key).toBe('tagged');
  });

  it('should remove a memory', async () => {
    await storeMemory(tmpDir, {
      key: 'to-remove',
      content: 'This entry will be removed shortly',
      memoryType: 'fact',
    });

    const removed = await removeMemory(tmpDir, 'to-remove');
    expect(removed).toBe(true);

    const all = await exportMemories(tmpDir);
    expect(all).toHaveLength(0);
  });

  it('should return false for removing nonexistent key', async () => {
    const removed = await removeMemory(tmpDir, 'nonexistent');
    expect(removed).toBe(false);
  });

  it('should export all memories', async () => {
    await storeMemory(tmpDir, { key: 'a', content: 'Content about alpha topic', memoryType: 'fact' });
    await storeMemory(tmpDir, { key: 'b', content: 'Content about beta topic', memoryType: 'context' });

    const exported = await exportMemories(tmpDir);
    expect(exported).toHaveLength(2);
    expect(exported[0].content).toBeTruthy();
  });

  it('should increment access count on query', async () => {
    await storeMemory(tmpDir, {
      key: 'accessed',
      content: 'Content about webhook configuration setup',
      memoryType: 'fact',
    });

    await queryMemories(tmpDir, 'webhook configuration');
    const entries = await exportMemories(tmpDir);
    expect(entries[0].accessCount).toBe(1);
  });
});

describe('duplicate key behavior', () => {
  let tmpDir: string;
  const originalEnv = process.env.AGENTVAULT_PASSPHRASE;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'av-mem-test-dup-key-'));
    fs.mkdirSync(path.join(tmpDir, '.agentvault'), { recursive: true });
    process.env.AGENTVAULT_PASSPHRASE = 'test-memory-passphrase';
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (originalEnv !== undefined) {
      process.env.AGENTVAULT_PASSPHRASE = originalEnv;
    } else {
      delete process.env.AGENTVAULT_PASSPHRASE;
    }
  });

  it('should overwrite existing entry and preserve accessCount reset', async () => {
    await storeMemory(tmpDir, { key: 'dup-key', content: 'original', memoryType: 'knowledge' });
    await queryMemories(tmpDir, 'original'); // Increment access count

    let entries = loadMemories(tmpDir);
    expect(entries[0].accessCount).toBe(1);
    expect(entries[0].content).toBe('original');

    await storeMemory(tmpDir, { key: 'dup-key', content: 'new content', memoryType: 'knowledge' });

    entries = loadMemories(tmpDir);
    expect(entries).toHaveLength(1);
    expect(entries[0].key).toBe('dup-key');
    expect(entries[0].content).toBe('new content');
    expect(entries[0].accessCount).toBe(0); // Access count should reset on overwrite
  });

  it('should update content but generate fresh keywords on overwrite', async () => {
    await storeMemory(tmpDir, { key: 'key-with-tags', content: 'Initial content about alpha and beta', memoryType: 'knowledge', tags: ['alpha', 'beta'] });

    let entries = loadMemories(tmpDir);
    expect(entries[0].keywords).toEqual(expect.arrayContaining(['alpha', 'beta', 'initial', 'content']));

    await storeMemory(tmpDir, { key: 'key-with-tags', content: 'Updated content about gamma and delta', memoryType: 'knowledge', tags: ['gamma', 'delta'] });

    entries = loadMemories(tmpDir);
    expect(entries).toHaveLength(1);
    expect(entries[0].keywords).toEqual(expect.arrayContaining(['gamma', 'delta', 'updated', 'content']));
    expect(entries[0].keywords).not.toEqual(expect.arrayContaining(['alpha', 'beta']));
  });
});

describe('memory list --limit equivalent (listMemories)', () => {
  let tmpDir: string;
  const originalEnv = process.env.AGENTVAULT_PASSPHRASE;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'av-mem-test-list-'));
    fs.mkdirSync(path.join(tmpDir, '.agentvault'), { recursive: true });
    process.env.AGENTVAULT_PASSPHRASE = 'test-memory-passphrase';
    for (let i = 0; i < 20; i++) {
      await storeMemory(tmpDir, { key: `mem-${i}`, content: `Content for memory ${i}`, memoryType: 'knowledge' });
    }
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (originalEnv !== undefined) {
      process.env.AGENTVAULT_PASSPHRASE = originalEnv;
    } else {
      delete process.env.AGENTVAULT_PASSPHRASE;
    }
  });

  it('should return all entries when no limit is applied', async () => {
    const entries = await listMemories(tmpDir);
    expect(entries).toHaveLength(20);
    expect(entries[0].contentLength).toBeGreaterThan(0);
    expect(entries[0].accessCount).toBeDefined();
  });

  it('should filter by tag', async () => {
    await storeMemory(tmpDir, { key: 'tagged-mem', content: 'Specific content', memoryType: 'knowledge', tags: ['special'] });
    const entries = await listMemories(tmpDir, { tag: 'special' });
    expect(entries).toHaveLength(1);
    expect(entries[0].key).toBe('tagged-mem');
  });

  it('should filter by memory type', async () => {
    await storeMemory(tmpDir, { key: 'fact-mem', content: 'A known fact', memoryType: 'fact' });
    const entries = await listMemories(tmpDir, { memoryType: 'fact' });
    expect(entries).toHaveLength(1);
    expect(entries[0].key).toBe('fact-mem');
  });
});

describe('comma-separated tag handling (via storeMemory, direct call)', () => {
  let tmpDir: string;
  const originalEnv = process.env.AGENTVAULT_PASSPHRASE;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'av-mem-test-comma-'));
    fs.mkdirSync(path.join(tmpDir, '.agentvault'), { recursive: true });
    process.env.AGENTVAULT_PASSPHRASE = 'test-memory-passphrase';
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (originalEnv !== undefined) {
      process.env.AGENTVAULT_PASSPHRASE = originalEnv;
    } else {
      delete process.env.AGENTVAULT_PASSPHRASE;
    }
  });
  it('should reject tags containing commas (CLI handles splitting)', async () => {
    await expect(storeMemory(tmpDir, {
      key: 'bad-tag-mem',
      content: 'Content',
      memoryType: 'knowledge',
      tags: ['comma,tag'],
    })).rejects.toThrow('Invalid tag');
  });

  it('should accept valid tags with hyphens and dots', async () => {
    await expect(storeMemory(tmpDir, {
      key: 'valid-tags-mem',
      content: 'Content',
      memoryType: 'knowledge',
      tags: ['api-v2', 'my.feature', 'tag123'],
    })).resolves.not.toThrow();
  });
});

