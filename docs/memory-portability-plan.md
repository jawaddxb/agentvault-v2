# Plan: Memory Import/Export — Full Portability

## Context

AgentVault's memory system works well for a single agent but has no way to share memories across agents (Cursor, OpenClaw, Claude Code on another machine). The `memory export` command dumps unfiltered plaintext JSON, there's no `memory import` command, and the `.avault` portable format always bundles secrets with memories. We need to close all 6 gaps to make memories truly portable.

---

## Changes Overview

### 1. Add `memory import <file>` CLI command
**File:** `src/commands/memory.ts`

New subcommand that bulk-imports memories from a file:
```
agentvault memory import memories.json
agentvault memory import memories.avault --passphrase mypass
agentvault memory import memories.json --merge        # skip existing keys
agentvault memory import memories.json --dry-run      # preview only
agentvault memory import memories.json --tag security  # import only entries with this tag
agentvault memory import memories.json --type knowledge # import only this type
```

Behavior:
- Auto-detect format: if file starts with `{` and has `salt`/`iv`/`tag`/`data` → encrypted `.avault`; otherwise parse as `MemoryEntry[]` JSON
- `--merge` flag: skip entries where key already exists (default: overwrite)
- `--dry-run`: print what would be imported without writing
- `--tag` / `--type` filters: only import matching entries
- Preserve `ttlSeconds` (recompute from `expiresAt`), `queryHash`, `confidence`, `source`, `tags` — don't drop fields
- Print summary: `Imported X memories (Y skipped, Z filtered out)`

### 2. Add filtered export to `memory export`
**File:** `src/commands/memory.ts`

Add filter options to the existing `export` subcommand:
```
agentvault memory export --tag security -o sec-rules.json
agentvault memory export --type knowledge -o knowledge.json
agentvault memory export --tag security --type knowledge -o filtered.json
```

Options to add:
- `--tag <tag>` — export only entries with this tag
- `--type <type>` — export only entries of this memoryType

Implementation: filter the `MemoryEntry[]` before serializing, reusing the same pattern as `listMemories`.

### 3. Add encrypted export to `memory export`
**File:** `src/commands/memory.ts`

Add encryption option:
```
agentvault memory export --encrypt --passphrase mypass -o memories.avault
```

Options to add:
- `--encrypt` — encrypt the output using the portable format
- `--passphrase <pass>` — required when `--encrypt` is used

Implementation: when `--encrypt`, build a memory-only portable envelope and encrypt with the provided passphrase using `writeEncryptedFile` from `src/vault/encryption.ts`.

### 4. Add `exportFilteredMemories()` to memory module
**File:** `src/memory/memory.ts`

New function:
```typescript
export async function exportFilteredMemories(
  projectDir: string,
  opts?: { tag?: string; memoryType?: MemoryType }
): Promise<MemoryEntry[]>
```

Loads all memories, applies tag/type filters, returns full `MemoryEntry[]` with content included.

### 5. Fix `vault import` to preserve TTL and queryHash
**File:** `src/commands/vault.ts`

Current code at line 73 drops `ttlSeconds` and `queryHash`:
```typescript
// BEFORE (drops fields)
await storeMemory(process.cwd(), {
  key: mem.key,
  content: mem.content,
  memoryType: mem.memoryType,
  tags: mem.tags,
  confidence: mem.confidence,
  source: mem.source,
});
```

Fix:
```typescript
// AFTER (preserves all fields)
await storeMemory(process.cwd(), {
  key: mem.key,
  content: mem.content,
  memoryType: mem.memoryType,
  tags: mem.tags,
  confidence: mem.confidence,
  source: mem.source,
  queryHash: mem.queryHash,
  ttlSeconds: mem.expiresAt
    ? Math.max(0, Math.round((new Date(mem.expiresAt).getTime() - Date.now()) / 1000))
    : undefined,
});
```

### 6. Add `--merge` support for memories in `vault import`
**File:** `src/commands/vault.ts`

Current code always overwrites memories on key collision. Add skip logic matching what secrets already do:
```typescript
const existingMemKeys = new Set(loadMemories(process.cwd()).map(e => e.key));
for (const mem of portable.memories) {
  if (existingMemKeys.has(mem.key) && !opts.merge) {
    console.log(`  Skipped memory: ${mem.key} (already exists)`);
    memSkipped++;
    continue;
  }
  // ... storeMemory call
}
```

### 7. Memory-only portable format support
**File:** `src/portable/portable.ts`

Add a new function for memory-only export:
```typescript
export function exportMemoryPortable(
  entries: MemoryEntry[],
  outputPath: string,
  exportPassphrase: string
): void
```

Uses the same `EncryptedEnvelope` format but wraps a `{ schema: 'agentvault-memory/1.0', exportedAt, memories }` object instead of the full `PortableVault`.

Add corresponding import:
```typescript
export function importMemoryPortable(
  inputPath: string,
  importPassphrase: string
): MemoryEntry[]
```

Auto-detects schema: if `agentvault-portable/1.0` → extract `.memories`; if `agentvault-memory/1.0` → return `.memories` directly.

### 8. Add `MemoryPortable` type
**File:** `src/types/index.ts`

```typescript
interface MemoryPortable {
  schema: 'agentvault-memory/1.0';
  exportedAt: string;
  memories: MemoryEntry[];
}
```

---

## Files Summary

| File | Action |
|------|--------|
| `src/commands/memory.ts` | Add `import` subcommand, add `--tag`/`--type`/`--encrypt`/`--passphrase` to `export` |
| `src/memory/memory.ts` | Add `exportFilteredMemories()` |
| `src/commands/vault.ts` | Fix memory import to preserve TTL/queryHash, add `--merge` for memories |
| `src/portable/portable.ts` | Add `exportMemoryPortable()` and `importMemoryPortable()` |
| `src/types/index.ts` | Add `MemoryPortable` interface |
| `tests/unit/memory.test.ts` | Add tests for filtered export, import roundtrip |
| `tests/integration/cli.test.ts` | Add tests for `memory import` and `memory export --encrypt` |

---

## Verification

### Manual testing
```bash
# Export filtered
AGENTVAULT_PASSPHRASE=naeemz-passphrase npx tsx src/index.ts memory export --tag security -o sec-rules.json

# Export encrypted
AGENTVAULT_PASSPHRASE=naeemz-passphrase npx tsx src/index.ts memory export --encrypt --passphrase share-pass -o memories.avault

# Import plain JSON
AGENTVAULT_PASSPHRASE=naeemz-passphrase npx tsx src/index.ts memory import sec-rules.json --dry-run
AGENTVAULT_PASSPHRASE=naeemz-passphrase npx tsx src/index.ts memory import sec-rules.json

# Import encrypted
AGENTVAULT_PASSPHRASE=naeemz-passphrase npx tsx src/index.ts memory import memories.avault --passphrase share-pass

# Roundtrip: export → import on fresh vault
AGENTVAULT_PASSPHRASE=naeemz-passphrase npx tsx src/index.ts memory export -o all.json
# (init new vault, import all.json, verify with memory list)
```

### Automated tests
```bash
npx vitest run tests/unit/memory.test.ts
npx vitest run tests/integration/cli.test.ts
```

---

## Execution Summary

All 7 tasks completed successfully. Build passes (`tsc --noEmit` clean). All 125 relevant tests pass (6 pre-existing `better-sqlite3` Node version mismatch failures are unrelated).

### What was built

1. **`MemoryPortable` type** (`src/types/index.ts`) — new `agentvault-memory/1.0` schema for memory-only files
2. **`exportFilteredMemories()`** (`src/memory/memory.ts`) — filter by tag/type before exporting
3. **`exportMemoryPortable()` / `importMemoryPortable()`** (`src/portable/portable.ts`) — encrypted memory-only .avault files, auto-detects both memory-only and full vault schemas on import
4. **`memory export` enhanced** (`src/commands/memory.ts`) — new `--tag`, `--type`, `--encrypt`, `--passphrase` options
5. **`memory import <file>`** (`src/commands/memory.ts`) — new command with auto-detect (JSON vs encrypted), `--merge`, `--dry-run`, `--tag`/`--type` filters, preserves TTL/queryHash
6. **`vault import` fixed** (`src/commands/vault.ts`) — now preserves `queryHash` and recomputes `ttlSeconds` from `expiresAt`, plus `--merge` skip logic for memories
7. **Tests** (`tests/unit/memory.test.ts`) — 8 new tests for filtered export, encrypted roundtrip, and import into fresh vault

### Usage examples
```bash
# Export security rules as encrypted file
agentvault memory export --tag security --encrypt --passphrase share-pass -o security-rules.avault

# Export knowledge entries as plain JSON
agentvault memory export --type knowledge -o knowledge.json

# Import on another machine / agent
agentvault memory import security-rules.avault --passphrase share-pass

# Import with merge (skip existing keys)
agentvault memory import knowledge.json --merge

# Preview before importing
agentvault memory import knowledge.json --dry-run
```
