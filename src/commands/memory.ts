import { Command } from 'commander';
import { storeMemory, queryMemories, listMemories, removeMemory, exportMemories } from '../memory/memory.js';
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
    .description('Export all memories to JSON')
    .option('-o, --output <file>', 'Output file path')
    .action(async (opts) => {
      const entries = await exportMemories(process.cwd());
      if (!entries.length) { console.log('No memories to export.'); return; }
      const content = JSON.stringify(entries, null, 2);
      if (opts.output) {
        const fs = await import('node:fs');
        fs.writeFileSync(opts.output, content);
        console.log(`Exported ${entries.length} memories to ${opts.output}`);
      } else {
        console.log(content);
      }
    });

  return cmd;
}
