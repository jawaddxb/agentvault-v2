import crypto from 'node:crypto';
import { STOPWORDS, MIN_KEYWORD_LENGTH, MAX_KEYWORDS, MIN_SEARCH_SCORE } from '../config/defaults.js';
import type { MemoryEntry } from '../types/index.js';

/** Detect if a character is CJK (Chinese, Japanese, Korean) */
function isCJK(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return (
    (code >= 0x4E00 && code <= 0x9FFF) ||   // CJK Unified Ideographs
    (code >= 0x3400 && code <= 0x4DBF) ||   // CJK Extension A
    (code >= 0x3040 && code <= 0x309F) ||   // Hiragana
    (code >= 0x30A0 && code <= 0x30FF) ||   // Katakana
    (code >= 0xAC00 && code <= 0xD7AF) ||   // Korean Hangul
    (code >= 0x3000 && code <= 0x303F)      // CJK Symbols
  );
}

/** Extract CJK bigrams from a string of CJK characters */
function extractCJKBigrams(text: string): string[] {
  const chars = [...text]; // Handle multi-byte correctly
  const bigrams: string[] = [];
  // Add individual characters as tokens (unigrams)
  for (const ch of chars) {
    if (ch.trim()) bigrams.push(ch);
  }
  // Add bigrams for better matching
  for (let i = 0; i < chars.length - 1; i++) {
    bigrams.push(chars[i] + chars[i + 1]);
  }
  return bigrams;
}

/** Extract keywords from content: lowercase, split, filter, dedupe, max 20
 *  Handles Latin, CJK (bigrams), and Arabic scripts */
export function extractKeywords(content: string): string[] {
  const lower = content.toLowerCase();

  // Split CJK and non-CJK segments
  const segments: string[] = [];
  let currentSegment = '';
  let currentIsCJK = false;

  for (const char of lower) {
    const charIsCJK = isCJK(char);
    if (charIsCJK !== currentIsCJK && currentSegment) {
      segments.push(currentSegment);
      currentSegment = '';
    }
    currentSegment += char;
    currentIsCJK = charIsCJK;
  }
  if (currentSegment) segments.push(currentSegment);

  const keywords: string[] = [];

  for (const segment of segments) {
    if (isCJK(segment[0])) {
      // CJK: extract unigrams + bigrams
      keywords.push(...extractCJKBigrams(segment));
    } else {
      // Latin/Arabic/other: split on whitespace + punctuation
      const words = segment
        .split(/[\s\p{P}]+/u)
        .filter(w => w.length >= MIN_KEYWORD_LENGTH)
        .filter(w => !STOPWORDS.has(w));
      keywords.push(...words);
    }
  }

  const unique = [...new Set(keywords)];
  return unique.slice(0, MAX_KEYWORDS);
}

/** Compute SHA-256 hash of a query for cache lookup */
export function computeQueryHash(query: string): string {
  return crypto.createHash('sha256').update(query.trim().toLowerCase()).digest('hex');
}

/** Calculate freshness multiplier: max(0, 1 - ageHours/ttlHours), 1.0 if no TTL */
function freshnessMultiplier(entry: MemoryEntry): number {
  if (!entry.expiresAt) return 1.0;
  const now = Date.now();
  const addedAt = new Date(entry.addedAt).getTime();
  const expiresAt = new Date(entry.expiresAt).getTime();
  const ttlHours = (expiresAt - addedAt) / (1000 * 60 * 60);
  if (ttlHours <= 0) return 0;
  const ageHours = (now - addedAt) / (1000 * 60 * 60);
  return Math.max(0, 1 - ageHours / ttlHours);
}

/** Calculate recency boost: 1 + (0.1 * min(accessCount, 10) / 10), max 1.1 */
function recencyBoost(entry: MemoryEntry): number {
  return 1 + (0.1 * Math.min(entry.accessCount, 10) / 10);
}

/** Score an entry against query tokens */
function scoreEntry(entry: MemoryEntry, queryTokens: string[]): number {
  if (queryTokens.length === 0) return 0;
  // Match against keywords (from content + user keywords) AND tags
  const entryKeywords = new Set([
    ...entry.keywords,
    ...entry.tags.map(t => t.toLowerCase()),
  ]);
  const matchCount = queryTokens.filter(t => entryKeywords.has(t)).length;
  const matchRatio = matchCount / queryTokens.length;
  return matchRatio * entry.confidence * freshnessMultiplier(entry) * recencyBoost(entry);
}

export interface SearchResult {
  entry: MemoryEntry;
  score: number;
}

export interface SearchResponse {
  results: SearchResult[];
  totalSearched: number;
}

/** Search memories with keyword ranking */
export function searchMemories(
  entries: MemoryEntry[],
  query: string,
  limit: number = 10
): SearchResponse {
  const totalSearched = entries.length;
  const queryHash = computeQueryHash(query);

  // 1. Check for exact cache hit (queryHash match)
  const cacheHit = entries.find(e => e.queryHash === queryHash);
  if (cacheHit) {
    return { results: [{ entry: cacheHit, score: 1.0 }], totalSearched };
  }

  // 2. Keyword ranking
  const queryTokens = extractKeywords(query);
  const scored: SearchResult[] = entries
    .map(entry => ({ entry, score: scoreEntry(entry, queryTokens) }))
    .filter(r => r.score >= MIN_SEARCH_SCORE);

  // Sort by score desc, ties broken by addedAt desc (newer wins)
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(b.entry.addedAt).getTime() - new Date(a.entry.addedAt).getTime();
  });

  return { results: scored.slice(0, limit), totalSearched };
}
