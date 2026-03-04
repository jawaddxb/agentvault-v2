import { Command } from 'commander';
import { storeMemory, queryMemories, listMemories, removeMemory, exportMemories, exportFilteredMemories, loadMemories as loadMemoriesSync } from '../memory/memory.js';
import { searchMemories } from '../memory/search.js';
import { checkLicense, consumeAccess, loadBankEntries, listPurchasedBanks, loadLicense } from '../license/license.js';
import type { MemoryType } from '../types/index.js';

export function memoryCommand(): Command {
  const cmd = new Command('memory').description('Manage agent memory store');

  cmd.command('store <key> <content>')
    .description('Store a memory entry')
    .option('-t, --type <type>', 'Memory type: knowledge|query_cache|operational', 'knowledge')
    .option('--tags <tags...>', 'Tags for categorization (space-separated or comma-separated)')
    .option('-c, --confidence <n>', 'Confidence score 0-1', '0.8')
    .option('-s, --source <source>', 'Source identifier')
    .option('--ttl <seconds>', 'Time-to-live in seconds')
    .option('--overwrite', 'Overwrite existing entry with same key without prompting')
    .action(async (key: string, content: string, opts) => {
      const dir = process.cwd();

      // BUG-3 fix: auto-split comma-separated tags
      let tags: string[] | undefined = opts.tags;
      if (tags) {
        tags = tags.flatMap((t: string) => t.split(',').map((s: string) => s.trim())).filter((t: string) => t.length > 0);
      }

      // BUG-1 fix: warn on duplicate key overwrite
      if (!opts.overwrite) {
        const { loadMemories } = await import('../memory/memory.js');
        const existing = loadMemories(dir);
        if (existing.some((e: { key: string }) => e.key === key)) {
          console.warn(`Warning: Key "${key}" already exists. Overwriting. Use --overwrite to suppress this warning.`);
        }
      }

      const entry = await storeMemory(dir, {
        key,
        content,
        memoryType: opts.type as MemoryType,
        tags,
        confidence: parseFloat(opts.confidence),
        source: opts.source,
        ttlSeconds: opts.ttl ? parseInt(opts.ttl) : undefined,
      });
      console.log(`Memory "${entry.key}" stored (${entry.keywords.length} keywords)`);
    });

  cmd.command('query <query>')
    .description('Search memories by keyword (includes purchased banks)')
    .option('-n, --limit <n>', 'Max results', '10')
    .option('--local-only', 'Search only local memories, skip purchased banks')
    .action(async (query: string, opts) => {
      const dir = process.cwd();
      const maxResults = parseInt(opts.limit);
      const response = await queryMemories(dir, query, maxResults);

      // Also search purchased banks (unless --local-only)
      const bankResults: Array<{ key: string; score: number; memoryType: string; content: string; source: string }> = [];
      if (!opts.localOnly) {
        try {
          const banks = listPurchasedBanks(dir);
          for (const bankName of banks) {
            const license = loadLicense(dir, bankName);
            const check = checkLicense(license);
            if (!check.valid) continue;

            const bankEntries = loadBankEntries(dir, bankName);
            const bankSearch = searchMemories(bankEntries, query, 5);
            for (const r of bankSearch.results) {
              bankResults.push({
                key: r.entry.key,
                score: r.score,
                memoryType: r.entry.memoryType,
                content: r.entry.content,
                source: `bank:${bankName}`,
              });
            }
            if (bankSearch.results.length > 0) {
              consumeAccess(dir, bankName);
            }
          }
        } catch { /* best-effort bank search */ }
      }

      // Merge local + bank results
      const allResults = [
        ...response.results.map(r => ({
          key: r.entry.key,
          score: r.score,
          memoryType: r.entry.memoryType,
          content: r.entry.content,
          source: 'local',
        })),
        ...bankResults,
      ].sort((a, b) => b.score - a.score).slice(0, maxResults);

      if (!allResults.length) {
        console.log(`No matching memories found. (${response.totalSearched} entries searched)`);
        return;
      }
      for (const r of allResults) {
        const src = r.source !== 'local' ? ` [${r.source}]` : '';
        console.log(`  [${r.score.toFixed(3)}] ${r.key} (${r.memoryType})${src} -- ${r.content.slice(0, 80)}`);
      }
      const bankCount = bankResults.length ? ` + ${bankResults.length} from banks` : '';
      console.log(`\n${allResults.length} result(s) from ${response.totalSearched} local entries${bankCount}`);
    });

  cmd.command('list')
    .description('List memory entries')
    .option('--tag <tag>', 'Filter by tag')
    .option('-t, --type <type>', 'Filter by memory type')
    .option('-n, --limit <n>', 'Max entries to show (default 100, use 0 for all)', '100')
    .action(async (opts) => {
      const all = await listMemories(process.cwd(), {
        tag: opts.tag,
        memoryType: opts.type as MemoryType | undefined,
      });
      if (!all.length) { console.log('No memories stored.'); return; }
      const maxShow = parseInt(opts.limit);
      const entries = maxShow === 0 ? all : all.slice(0, maxShow);
      for (const e of entries) {
        const tags = e.tags.length ? ` [${e.tags.join(', ')}]` : '';
        console.log(`  ${e.key} (${e.memoryType})${tags} -- ${e.contentLength} chars, accessed ${e.accessCount}x`);
      }
      if (maxShow > 0 && all.length > maxShow) {
        console.log(`\n  ... and ${all.length - maxShow} more (use --limit 0 to show all)`);
      }
      console.log(`\n${all.length} entries total`);
    });

  cmd.command('remove <key>')
    .description('Remove a memory entry')
    .option('--dry-run', 'Preview without removing')
    .action(async (key: string, opts) => {
      if (opts.dryRun) {
        console.log(`[DRY RUN] Would remove memory "${key}"`);
        return;
      }
      const removed = await removeMemory(process.cwd(), key);
      if (removed) console.log(`Memory "${key}" removed`);
      else console.log(`Memory "${key}" not found.`);
    });

  cmd.command('export')
    .description('Export memories to JSON or encrypted .avault')
    .option('-o, --output <file>', 'Output file path')
    .option('--tag <tag>', 'Export only entries with this tag')
    .option('-t, --type <type>', 'Export only entries of this memory type')
    .option('--encrypt', 'Encrypt output using portable format')
    .option('--passphrase <passphrase>', 'Passphrase for encrypted export (required with --encrypt)')
    .action(async (opts) => {
      if (opts.encrypt && !opts.passphrase) {
        console.error('Encrypted export requires --passphrase');
        process.exit(1);
      }

      const hasFilters = opts.tag || opts.type;
      const entries = hasFilters
        ? await exportFilteredMemories(process.cwd(), {
            tag: opts.tag,
            memoryType: opts.type as MemoryType | undefined,
          })
        : await exportMemories(process.cwd());

      if (!entries.length) { console.log('No memories to export.'); return; }

      if (opts.encrypt) {
        const { exportMemoryPortable } = await import('../portable/portable.js');
        const outPath = opts.output ?? 'memories.avault';
        exportMemoryPortable(entries, outPath, opts.passphrase);
        console.log(`Exported ${entries.length} memories (encrypted) to ${outPath}`);
      } else {
        const content = JSON.stringify(entries, null, 2);
        if (opts.output) {
          const fs = await import('node:fs');
          fs.writeFileSync(opts.output, content);
          console.log(`Exported ${entries.length} memories to ${opts.output}`);
        } else {
          console.log(content);
        }
      }
    });

  cmd.command('import <file>')
    .description('Import memories from JSON or encrypted .avault file')
    .option('--passphrase <passphrase>', 'Passphrase for encrypted .avault file')
    .option('--merge', 'Skip entries where key already exists (default: overwrite)')
    .option('--dry-run', 'Preview without importing')
    .option('--tag <tag>', 'Import only entries with this tag')
    .option('-t, --type <type>', 'Import only entries of this memory type')
    .action(async (file: string, opts) => {
      const fs = await import('node:fs');
      const dir = process.cwd();

      if (!fs.existsSync(file)) {
        console.error(`File not found: ${file}`);
        process.exit(1);
      }

      // Auto-detect format
      const raw = fs.readFileSync(file, 'utf-8');
      let entries: Array<{
        key: string; content: string; memoryType: string; tags?: string[];
        confidence?: number; source?: string; queryHash?: string; expiresAt?: string;
      }>;

      try {
        const parsed = JSON.parse(raw);
        if (parsed.salt && parsed.iv && parsed.tag && parsed.data) {
          // Encrypted format
          if (!opts.passphrase) {
            console.error('Encrypted file detected. Provide --passphrase to decrypt.');
            process.exit(1);
          }
          const { importMemoryPortable } = await import('../portable/portable.js');
          entries = importMemoryPortable(file, opts.passphrase);
        } else if (Array.isArray(parsed)) {
          // Plain JSON array of MemoryEntry
          entries = parsed;
        } else {
          console.error('Unrecognized format. Expected MemoryEntry[] JSON array or encrypted .avault file.');
          process.exit(1);
        }
      } catch (err) {
        console.error(`Failed to parse ${file}: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }

      // Apply filters
      let filtered = entries;
      let filteredOut = 0;
      if (opts.tag) {
        const before = filtered.length;
        filtered = filtered.filter(e => e.tags?.includes(opts.tag));
        filteredOut += before - filtered.length;
      }
      if (opts.type) {
        const before = filtered.length;
        filtered = filtered.filter(e => e.memoryType === opts.type);
        filteredOut += before - filtered.length;
      }

      if (opts.dryRun) {
        console.log(`[DRY RUN] Would import ${filtered.length} memories from ${file}:`);
        for (const e of filtered) {
          const tags = e.tags?.length ? ` [${e.tags.join(', ')}]` : '';
          console.log(`  ${e.key} (${e.memoryType})${tags}`);
        }
        if (filteredOut > 0) console.log(`  (${filteredOut} entries excluded by filters)`);
        return;
      }

      // Load existing keys for merge check
      const existingKeys = opts.merge
        ? new Set(loadMemoriesSync(dir).map(e => e.key))
        : new Set<string>();

      let imported = 0;
      let skipped = 0;
      for (const mem of filtered) {
        if (opts.merge && existingKeys.has(mem.key)) {
          skipped++;
          continue;
        }

        // Recompute TTL from expiresAt if present
        let ttlSeconds: number | undefined;
        if (mem.expiresAt) {
          const remaining = Math.round((new Date(mem.expiresAt).getTime() - Date.now()) / 1000);
          if (remaining > 0) ttlSeconds = remaining;
        }

        await storeMemory(dir, {
          key: mem.key,
          content: mem.content,
          memoryType: mem.memoryType as MemoryType,
          tags: mem.tags,
          confidence: mem.confidence,
          source: mem.source,
          queryHash: mem.queryHash,
          ttlSeconds,
        });
        imported++;
      }

      console.log(`Imported ${imported} memories from ${file}`);
      if (skipped > 0) console.log(`Skipped ${skipped} existing entries (--merge)`);
      if (filteredOut > 0) console.log(`Filtered out ${filteredOut} entries`);
    });

  return cmd;
}
