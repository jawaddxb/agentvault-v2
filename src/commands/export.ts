import { Command } from 'commander';
import { exportPortable } from '../portable/portable.js';

export function exportCommand(): Command {
  return new Command('export')
    .description('Export vault to portable .avault format')
    .requiredOption('-o, --output <path>', 'Output file path')
    .requiredOption('-p, --passphrase <passphrase>', 'Export passphrase (separate from vault passphrase)')
    .option('--dry-run', 'Preview without exporting')
    .action((opts) => {
      if (opts.dryRun) {
        console.log(`[DRY RUN] Would export vault to ${opts.output}`);
        console.log('  Includes: all secrets + all memories');
        console.log('  Encrypted with the provided export passphrase');
        return;
      }

      exportPortable(process.cwd(), opts.output, opts.passphrase);
      console.log(`Vault exported to ${opts.output}`);
      console.log('  Encrypted with your export passphrase.');
      console.log('  Import on another machine with `agentvault import <file>`');
    });
}
