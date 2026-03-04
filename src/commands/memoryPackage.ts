import { Command } from 'commander';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { resolvePaths } from '../config/paths.js';
import { loadMemories } from '../memory/memory.js';
import { getPassphrase, writeEncryptedFile } from '../vault/encryption.js';
import type { BankDescriptor, LicenseDescriptor, MemoryEntry } from '../types/index.js';

export function memoryPackageCommand(): Command {
  return new Command('package')
    .description('Package memories into a purchasable bank')
    .requiredOption('--from-tag <tag>', 'Tag to filter memories by')
    .requiredOption('--name <name>', 'Bank name')
    .requiredOption('--price <price>', 'Price identifier')
    .option('--description <desc>', 'Bank description', '')
    .option('--access-type <type>', 'License type: unlimited|time_locked|access_limited|time_and_access|subscription', 'unlimited')
    .option('--max-accesses <n>', 'Max accesses for access_limited types')
    .option('--expires-days <n>', 'Days until expiry for time_locked types')
    .option('--since <days>', 'Only include memories from the last N days')
    .option('--dry-run', 'Preview without creating the package')
    .action((opts) => {
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(opts.name)) {
        console.error('Invalid bank name. Use alphanumeric, dashes, underscores. Max 128 chars.');
        process.exit(1);
      }
      const dir = process.cwd();
      const entries = loadMemories(dir);
      let filtered = entries.filter(e => e.tags.includes(opts.fromTag));

      if (opts.since) {
        const cutoff = Date.now() - parseInt(opts.since) * 86400000;
        filtered = filtered.filter(e => new Date(e.addedAt).getTime() >= cutoff);
      }

      if (!filtered.length) {
        console.log(`No memories found with tag "${opts.fromTag}"`);
        return;
      }

      if (opts.dryRun) {
        console.log(`[DRY RUN] Would package ${filtered.length} entries from tag "${opts.fromTag}"`);
        console.log(`  Bank name: ${opts.name}`);
        console.log(`  Access type: ${opts.accessType}`);
        console.log(`  Sample keys: ${filtered.slice(0, 5).map(e => e.key).join(', ')}`);
        return;
      }

      const bankDir = path.join(resolvePaths(dir).base, 'packaged-banks', opts.name);
      fs.mkdirSync(bankDir, { recursive: true });

      // Write encrypted bank data
      const passphrase = getPassphrase(dir);
      writeEncryptedFile(path.join(bankDir, 'bank.encrypted'), filtered, passphrase);

      // Compute content hash: sort entries by key, join with \x00, SHA-256
      const sortedKeys = filtered.map(e => e.key).sort();
      const hashInput = sortedKeys.join('\x00');
      const contentHash = crypto.createHash('sha256').update(hashInput, 'utf-8').digest('hex');

      // Select preview entries (first 3)
      const previewEntries = filtered.slice(0, 3).map(e => ({
        key: e.key,
        content: e.content.slice(0, 200),
      }));

      // Write descriptor
      const descriptor: BankDescriptor = {
        schema: 'agentvault-bank-descriptor/1.0',
        name: opts.name,
        description: opts.description,
        entryCount: filtered.length,
        contentHash,
        tags: [opts.fromTag],
        accessModel: opts.accessType,
        previewEntries,
        createdAt: new Date().toISOString(),
      };
      fs.writeFileSync(path.join(bankDir, 'descriptor.json'), JSON.stringify(descriptor, null, 2));

      // Write license
      const now = new Date();
      const license: LicenseDescriptor = {
        name: opts.name,
        accessType: opts.accessType,
        issuedAt: now.toISOString(),
        expiresAt: opts.expiresDays
          ? new Date(now.getTime() + parseInt(opts.expiresDays) * 86400000).toISOString()
          : undefined,
        remainingAccesses: opts.maxAccesses ? parseInt(opts.maxAccesses) : undefined,
        maxAccesses: opts.maxAccesses ? parseInt(opts.maxAccesses) : undefined,
      };
      fs.writeFileSync(path.join(bankDir, 'license.json'), JSON.stringify(license, null, 2));

      console.log(`Bank "${opts.name}" packaged: ${filtered.length} entries from tag "${opts.fromTag}"`);
      console.log(`  Location: ${bankDir}`);
      console.log(`  Access type: ${opts.accessType}`);
    });
}
