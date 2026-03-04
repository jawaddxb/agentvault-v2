import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { resolvePaths } from '../config/paths.js';
import { getWalletAddress, signMessage } from '../wallet/wallet.js';
import { getPassphrase } from '../vault/encryption.js';

export function checkoutCommand(): Command {
  return new Command('checkout')
    .description('Purchase a knowledge bank from a gateway')
    .argument('<bank-name>', 'Bank name to purchase')
    .option('--gateway <url>', 'Gateway URL', 'http://localhost:3200')
    .option('--dry-run', 'Preview without purchasing')
    .action(async (bankName: string, opts) => {
      const dir = process.cwd();

      let buyerAddress: string;
      try {
        buyerAddress = getWalletAddress(dir);
      } catch {
        console.error('No wallet found. Run `agentvault wallet create` first.');
        process.exit(1);
      }

      // Check if bank exists on gateway
      try {
        const bankRes = await fetch(`${opts.gateway}/banks/${bankName}`);
        if (!bankRes.ok) {
          console.error(`Bank "${bankName}" not found on gateway`);
          process.exit(1);
        }

        const bank = await bankRes.json() as {
          name: string; description: string; entryCount: number;
          accessModel: string; contentHash: string;
        };

        if (opts.dryRun) {
          console.log(`[DRY RUN] Would purchase bank "${bankName}"`);
          console.log(`  Entries: ${bank.entryCount}`);
          console.log(`  Access model: ${bank.accessModel}`);
          console.log(`  Content hash: ${bank.contentHash}`);
          console.log(`  Buyer: ${buyerAddress}`);
          return;
        }

        console.log(`Purchasing "${bankName}"...`);

        // Sign checkout message with current timestamp
        const timestamp = Date.now().toString();
        const message = `checkout:${bankName}:${timestamp}`;
        const signature = await signMessage(dir, message);

        // Generate a one-time export passphrase (NOT the vault master passphrase)
        const crypto = await import('node:crypto');
        const exportPassphrase = crypto.randomBytes(32).toString('hex');

        // Send checkout request
        const checkoutRes = await fetch(`${opts.gateway}/banks/${bankName}/checkout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            buyerAddress,
            signature,
            timestamp,
            exportPassphrase,
          }),
        });

        if (!checkoutRes.ok) {
          const err = await checkoutRes.json() as { error: string };
          console.error(`Checkout failed: ${err.error}`);
          process.exit(1);
        }

        const result = await checkoutRes.json() as {
          license: Record<string, unknown>;
          bank: Record<string, unknown>;
          contentHash: string;
        };

        // Verify content hash
        if (result.contentHash !== bank.contentHash) {
          console.error('WARNING: Content hash mismatch! Bank may have been tampered with.');
          process.exit(1);
        }

        // Decrypt with export passphrase, re-encrypt with buyer's vault passphrase
        const { decrypt, writeEncryptedFile } = await import('../vault/encryption.js');
        const decryptedEntries = JSON.parse(decrypt(result.bank as any, exportPassphrase));

        // Save to purchased-banks directory
        const purchasedDir = path.join(resolvePaths(dir).purchasedBanks, bankName);
        fs.mkdirSync(purchasedDir, { recursive: true, mode: 0o700 });
        fs.writeFileSync(path.join(purchasedDir, 'license.json'), JSON.stringify(result.license, null, 2), { mode: 0o600 });
        const vaultPassphrase = getPassphrase(dir);
        writeEncryptedFile(path.join(purchasedDir, 'bank.encrypted'), decryptedEntries, vaultPassphrase);
        fs.writeFileSync(path.join(purchasedDir, 'descriptor.json'), JSON.stringify(bank, null, 2), { mode: 0o600 });

        console.log(`Bank "${bankName}" purchased and installed`);
        console.log(`  Location: ${purchasedDir}`);
        console.log(`  Entries: ${bank.entryCount}`);
        console.log(`  Access model: ${bank.accessModel}`);
        console.log('');
        console.log('Query it via MCP: vault.memory.query "<your question>"');

      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('ECONNREFUSED')) {
          console.error('Cannot connect to gateway. Is it running?');
        } else {
          console.error(`Error: ${msg}`);
        }
        process.exit(1);
      }
    });
}
