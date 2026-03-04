import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import { memoryCommand } from '../../src/commands/memory.js';
import * as MemoryModule from '../../src/memory/memory.js'; // Import all from memory.js
import { MemoryEntry } from '../../src/types/index.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Mock console.warn and console.log for CLI output testing
const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

// Mock process.exit to prevent test runner from exiting
const mockExit = vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
  throw new Error(`process.exit called with code ${code}`);
});

let mockMemories: MemoryEntry[] = [];

// Mock storeMemory and listMemories to control behavior without actual file ops
vi.mock('../../src/memory/memory.js', async (importOriginal) => {
  const mod = await importOriginal<typeof MemoryModule>();
  return {
    ...mod,
    loadMemories: vi.fn(() => mockMemories),
    storeMemory: vi.fn(async (dir, opts) => {
      const existingIndex = mockMemories.findIndex(m => m.key === opts.key);
      const newEntry: MemoryEntry = {
        key: opts.key,
        content: opts.content,
        memoryType: opts.memoryType,
        tags: opts.tags ?? [],
        keywords: opts.tags ?? [], // Simplified mock keywords
        confidence: opts.confidence ?? 0.8,
        source: opts.source,
        expiresAt: opts.ttlSeconds ? new Date(Date.now() + opts.ttlSeconds * 1000).toISOString() : undefined,
        accessCount: 0,
        addedAt: new Date().toISOString(),
        vaultType: 'memory',
      };
      if (existingIndex > -1) {
        mockMemories[existingIndex] = { ...newEntry, accessCount: 0 }; // Reset accessCount on overwrite
      } else {
        mockMemories.push(newEntry);
      }
      return newEntry;
    }),
    listMemories: vi.fn(async (dir, opts) => {
      let filtered = mockMemories;
      if (opts?.tag) filtered = filtered.filter(e => e.tags.includes(opts.tag!));
      if (opts?.memoryType) filtered = filtered.filter(e => e.memoryType === opts.memoryType);
      return filtered.map(e => ({ ...e, contentLength: e.content.length }));
    }),
    queryMemories: vi.fn(mod.queryMemories),
    removeMemory: vi.fn(mod.removeMemory),
    exportMemories: vi.fn(mod.exportMemories),
  };
});

describe('CLI memory command behavior', () => {
  let cli: Command;
  let tmpDir: string;
  const originalEnv = process.env.AGENTVAULT_PASSPHRASE;

  beforeEach(() => {
    cli = new Command();
    cli.exitOverride(); // Prevent process.exit from terminating the test runner
    cli.configureOutput({
      writeOut: (str) => consoleLogSpy(str),
      writeErr: (str) => consoleWarnSpy(str),
      outputError: (str, write) => consoleWarnSpy(str),
    });
    cli.addCommand(memoryCommand());
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'av-cli-mem-test-'));
    // Ensure current working directory is set to tmpDir for CLI commands
    process.chdir(tmpDir);
    fs.mkdirSync(path.join(tmpDir, '.agentvault'), { recursive: true });
    process.env.AGENTVAULT_PASSPHRASE = 'test-cli-passphrase';
    consoleWarnSpy.mockClear();
    consoleLogSpy.mockClear();
    mockMemories = []; // Reset for each test
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (originalEnv !== undefined) {
      process.env.AGENTVAULT_PASSPHRASE = originalEnv;
    } else {
      delete process.env.AGENTVAULT_PASSPHRASE;
    }
    vi.clearAllMocks();
    // Restore original cwd
    process.chdir(path.resolve(__dirname, '..', '..', '..'));
  });

  // Test: store command with comma tags → they get split before storeMemory is called
  it('store command should auto-split comma-separated tags', async () => {
    await cli.parseAsync(['node', 'test', 'memory', 'store', 'key1', 'content', '--tags', 'tag1,tag2', 'tag3']);
    expect(MemoryModule.storeMemory).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      key: 'key1',
      content: 'content',
      tags: ['tag1', 'tag2', 'tag3'],
    }));
  });

  // Test: store with duplicate key → console.warn is called with the right message
  it('store command should warn on duplicate key by default', async () => {
    // First store
    await cli.parseAsync(['node', 'test', 'memory', 'store', 'dup-key', 'content1']);
    expect(consoleWarnSpy).not.toHaveBeenCalled();

    // Second store with same key
    await cli.parseAsync(['node', 'test', 'memory', 'store', 'dup-key', 'content2']);
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Warning: Key "dup-key" already exists. Overwriting.'));
    // Verify the content was updated and accessCount reset (via mock)
    expect(mockMemories).toHaveLength(1);
    expect(mockMemories[0].content).toBe('content2');
    expect(mockMemories[0].accessCount).toBe(0);
  });

  // Test: store with --overwrite → console.warn is NOT called
  it('store command should not warn on duplicate key when --overwrite is used', async () => {
    // First store
    await cli.parseAsync(['node', 'test', 'memory', 'store', 'dup-key-no-warn', 'content1']);
    expect(consoleWarnSpy).not.toHaveBeenCalled();

    // Second store with --overwrite
    await cli.parseAsync(['node', 'test', 'memory', 'store', 'dup-key-no-warn', 'content2', '--overwrite']);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    // Verify the content was updated and accessCount reset (via mock)
    expect(mockMemories).toHaveLength(1);
    expect(mockMemories[0].content).toBe('content2');
    expect(mockMemories[0].accessCount).toBe(0);
  });

  // Test: list with default limit → only first 100 shown
  it('list command should show first 100 memories by default', async () => {
    for (let i = 0; i < 150; i++) {
      await MemoryModule.storeMemory(tmpDir, { key: `mem-${i}`, content: `content-${i}`, memoryType: 'knowledge' });
    }
    await cli.parseAsync(['node', 'test', 'memory', 'list']);
    const logs = consoleLogSpy.mock.calls.flat().join('\n');
    expect(logs).toContain('  mem-0');
    expect(logs).not.toContain('  mem-100'); // Should not contain the 101st entry if limit is 100
    expect(logs).toContain('... and 50 more (use --limit 0 to show all)');
    expect(logs).toContain('150 entries total');
    const lines = logs.split('\n').filter(l => l.startsWith('  mem-')).length;
    expect(lines).toBe(100);
  });

  // Test: list with --limit 0 → all shown
  it('list command should show all memories when --limit 0 is used', async () => {
    for (let i = 0; i < 150; i++) {
      await MemoryModule.storeMemory(tmpDir, { key: `mem-${i}`, content: `content-${i}`, memoryType: 'knowledge' });
    }
    await cli.parseAsync(['node', 'test', 'memory', 'list', '--limit', '0']);
    const logs = consoleLogSpy.mock.calls.flat().join('\n');
    expect(logs).toContain('  mem-0');
    expect(logs).toContain('  mem-149');
    expect(logs).not.toContain('... and');
    expect(logs).toContain('150 entries total');
    const lines = logs.split('\n').filter(l => l.startsWith('  mem-')).length;
    expect(lines).toBe(150);
  });

  // Test: list with --limit N → N entries shown
  it('list command should show N memories when --limit N is used', async () => {
    for (let i = 0; i < 20; i++) {
      await MemoryModule.storeMemory(tmpDir, { key: `mem-${i}`, content: `content-${i}`, memoryType: 'knowledge' });
    }
    await cli.parseAsync(['node', 'test', 'memory', 'list', '--limit', '5']);
    const logs = consoleLogSpy.mock.calls.flat().join('\n');
    expect(logs).toContain('  mem-0');
    expect(logs).toContain('  mem-4');
    expect(logs).toContain('... and 15 more (use --limit 0 to show all)');
    expect(logs).toContain('20 entries total');
    const lines = logs.split('\n').filter(l => l.startsWith('  mem-')).length;
    expect(lines).toBe(5);
  });
});
