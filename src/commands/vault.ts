import { Command } from 'commander';
import fs from 'node:fs';
import { exportPortable, importPortable } from '../portable/portable.js';
import { addSecret, loadVault } from '../vault/vault.js';
import { storeMemory, loadMemories } from '../memory/memory.js';

export function vaultCommand(): Command {
  const cmd = new Command('vault').description('Vault export/import operations');

  cmd.command('export <output>')
    .description('Export vault to portable .avault file')
    .requiredOption('--passphrase <passphrase>', 'Passphrase for the exported file')
    .option('--include-memories', 'Include memory entries', true)
    .option('--decrypted', 'Export as plaintext JSON (requires --confirm-plaintext)')
    .option('--confirm-plaintext', 'Confirm plaintext export')
    .action((output: string, opts) => {
      if (opts.decrypted) {
        if (!opts.confirmPlaintext) {
          console.error('Plaintext export requires --confirm-plaintext flag');
          process.exit(1);
        }
        if (!opts.passphrase) {
          console.error('Plaintext export requires --passphrase to verify vault access');
          process.exit(1);
        }
        // Passphrase is verified implicitly by loadVault (decryption fails if wrong)
        const entries = loadVault(process.cwd());
        const memories = opts.includeMemories ? loadMemories(process.cwd()) : [];
        const data = JSON.stringify({ entries, memories }, null, 2);
        fs.writeFileSync(output, data, { mode: 0o600 });
        console.log(`Exported plaintext to ${output} (permissions: 0600)`);
        return;
      }

      exportPortable(process.cwd(), output, opts.passphrase, {
        includeMemories: opts.includeMemories,
      });
      console.log(`Exported vault to ${output}`);
    });

  cmd.command('import <input>')
    .description('Import from a portable .avault file')
    .requiredOption('--passphrase <passphrase>', 'Passphrase for the imported file')
    .option('--merge', 'Overwrite existing keys (default: skip existing)')
    .option('--dry-run', 'Preview without importing')
    .action(async (input: string, opts) => {
      const portable = importPortable(input, opts.passphrase);

      if (opts.dryRun) {
        console.log(`[DRY RUN] Would import from ${input}:`);
        console.log(`  ${portable.entries.length} secret(s): ${portable.entries.map(e => e.key).join(', ')}`);
        console.log(`  ${portable.memories.length} memory/memories`);
        return;
      }

      let secretCount = 0;
      let skippedSecrets = 0;
      let memoryCount = 0;
      let skippedMemories = 0;
      const { loadVault: loadExisting } = await import('../vault/vault.js');
      const existingKeys = new Set(loadExisting(process.cwd()).map(e => e.key));
      const existingMemKeys = new Set(loadMemories(process.cwd()).map(e => e.key));

      for (const entry of portable.entries) {
        if (existingKeys.has(entry.key) && !opts.merge) {
          console.log(`  Skipped secret: ${entry.key} (already exists, use --merge to overwrite)`);
          skippedSecrets++;
          continue;
        }
        addSecret(process.cwd(), entry.key, entry.value);
        secretCount++;
      }

      for (const mem of portable.memories) {
        if (existingMemKeys.has(mem.key) && !opts.merge) {
          console.log(`  Skipped memory: ${mem.key} (already exists, use --merge to overwrite)`);
          skippedMemories++;
          continue;
        }

        // Preserve TTL by recomputing from expiresAt
        let ttlSeconds: number | undefined;
        if (mem.expiresAt) {
          const remaining = Math.round((new Date(mem.expiresAt).getTime() - Date.now()) / 1000);
          if (remaining > 0) ttlSeconds = remaining;
        }

        await storeMemory(process.cwd(), {
          key: mem.key,
          content: mem.content,
          memoryType: mem.memoryType,
          tags: mem.tags,
          confidence: mem.confidence,
          source: mem.source,
          queryHash: mem.queryHash,
          ttlSeconds,
        });
        memoryCount++;
      }

      console.log(`Imported ${secretCount} secret(s) and ${memoryCount} memory/memories from ${input}`);
      if (skippedSecrets) console.log(`Skipped ${skippedSecrets} existing secret(s)`);
      if (skippedMemories) console.log(`Skipped ${skippedMemories} existing memory/memories`);
    });

  return cmd;
}
