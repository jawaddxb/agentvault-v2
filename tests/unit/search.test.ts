import { describe, it, expect } from 'vitest';
import { extractKeywords, computeQueryHash, searchMemories } from '../../src/memory/search.js';
import type { MemoryEntry } from '../../src/types/index.js';

function makeEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    key: 'test-key',
    vaultType: 'memory',
    memoryType: 'fact',
    tags: [],
    keywords: [],
    content: 'test content',
    confidence: 0.8,
    accessCount: 0,
    addedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('extractKeywords', () => {
  it('should extract lowercase keywords', () => {
    const keywords = extractKeywords('Hello World Test');
    expect(keywords).toEqual(['hello', 'world', 'test']);
  });

  it('should filter out short words (< 3 chars)', () => {
    const keywords = extractKeywords('a to go run the');
    // 'run' is 3 chars so it passes; 'the' is a stopword
    expect(keywords).toEqual(['run']);
  });

  it('should filter stopwords', () => {
    const keywords = extractKeywords('the quick brown fox and the lazy dog');
    expect(keywords).toContain('quick');
    expect(keywords).toContain('brown');
    expect(keywords).toContain('fox');
    expect(keywords).toContain('lazy');
    expect(keywords).toContain('dog');
    expect(keywords).not.toContain('the');
    expect(keywords).not.toContain('and');
  });

  it('should deduplicate', () => {
    const keywords = extractKeywords('hello hello world world');
    expect(keywords).toEqual(['hello', 'world']);
  });

  it('should limit to MAX_KEYWORDS', () => {
    const words = Array.from({ length: 50 }, (_, i) => `word${i.toString().padStart(3, '0')}`);
    const keywords = extractKeywords(words.join(' '));
    expect(keywords.length).toBe(40);
  });

  it('should split on punctuation', () => {
    const keywords = extractKeywords('hello,world;test.data');
    expect(keywords).toEqual(['hello', 'world', 'test', 'data']);
  });
});

describe('computeQueryHash', () => {
  it('should produce consistent hashes', () => {
    const h1 = computeQueryHash('test query');
    const h2 = computeQueryHash('test query');
    expect(h1).toBe(h2);
  });

  it('should be case-insensitive', () => {
    const h1 = computeQueryHash('Test Query');
    const h2 = computeQueryHash('test query');
    expect(h1).toBe(h2);
  });

  it('should trim whitespace', () => {
    const h1 = computeQueryHash('  test query  ');
    const h2 = computeQueryHash('test query');
    expect(h1).toBe(h2);
  });
});

describe('searchMemories', () => {
  it('should find exact cache hit', () => {
    const hash = computeQueryHash('webhook setup');
    const entries = [
      makeEntry({ key: 'cached', queryHash: hash, content: 'cached result' }),
      makeEntry({ key: 'other', keywords: ['webhook'], content: 'other' }),
    ];

    const response = searchMemories(entries, 'webhook setup');
    expect(response.results).toHaveLength(1);
    expect(response.results[0].entry.key).toBe('cached');
    expect(response.results[0].score).toBe(1.0);
  });

  it('should rank by keyword match ratio', () => {
    const entries = [
      makeEntry({ key: 'partial', keywords: ['webhook'], confidence: 0.8 }),
      makeEntry({ key: 'full', keywords: ['webhook', 'setup'], confidence: 0.8 }),
    ];

    const response = searchMemories(entries, 'webhook setup guide');
    // 'full' matches 2/3 query tokens, 'partial' matches 1/3
    expect(response.results[0].entry.key).toBe('full');
  });

  it('should respect minimum score threshold (0.1)', () => {
    const entries = [
      makeEntry({ key: 'low', keywords: ['unrelated'], confidence: 0.1 }),
    ];

    const response = searchMemories(entries, 'webhook setup');
    expect(response.results).toHaveLength(0);
  });

  it('should NOT partial-match keywords', () => {
    // "web" should NOT match "webhook"
    const entries = [
      makeEntry({ key: 'webhook-entry', keywords: ['webhook'] }),
    ];

    const response = searchMemories(entries, 'web');
    expect(response.results).toHaveLength(0);
  });

  it('should apply confidence weighting', () => {
    const entries = [
      makeEntry({ key: 'low-conf', keywords: ['test'], confidence: 0.3 }),
      makeEntry({ key: 'high-conf', keywords: ['test'], confidence: 0.9 }),
    ];

    const response = searchMemories(entries, 'test');
    expect(response.results[0].entry.key).toBe('high-conf');
  });

  it('should break ties by addedAt (newer wins)', () => {
    const entries = [
      makeEntry({ key: 'old', keywords: ['test'], confidence: 0.8, addedAt: '2024-01-01T00:00:00Z' }),
      makeEntry({ key: 'new', keywords: ['test'], confidence: 0.8, addedAt: '2025-01-01T00:00:00Z' }),
    ];

    const response = searchMemories(entries, 'test');
    expect(response.results[0].entry.key).toBe('new');
  });

  it('should apply recency boost for frequently accessed entries', () => {
    const entries = [
      makeEntry({ key: 'unused', keywords: ['test'], confidence: 0.8, accessCount: 0 }),
      makeEntry({ key: 'popular', keywords: ['test'], confidence: 0.8, accessCount: 10 }),
    ];

    const response = searchMemories(entries, 'test');
    // popular has recencyBoost of 1.1, unused has 1.0
    expect(response.results[0].entry.key).toBe('popular');
  });

  it('should respect limit', () => {
    const entries = Array.from({ length: 20 }, (_, i) =>
      makeEntry({ key: `entry-${i}`, keywords: ['test'], confidence: 0.8 })
    );

    const response = searchMemories(entries, 'test', 5);
    expect(response.results).toHaveLength(5);
  });
});
