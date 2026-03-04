import { Command } from 'commander';
import { createWallet, getWalletAddress, signMessage, exportMnemonic } from '../wallet/wallet.js';

export function walletCommand(): Command {
  const cmd = new Command('wallet').description('Manage Base L2 wallet');

  cmd.command('create')
    .description('Generate a new wallet (Base L2)')
    .action(() => {
      const info = createWallet(process.cwd());
      console.log('Wallet created');
      console.log(`  Address: ${info.address}`);
      console.log(`  Created: ${info.createdAt}`);
      console.log('');
      console.log('Your private key is encrypted in .agentvault/wallet.json');
      console.log('Back up your vault passphrase — it protects your wallet.');
      console.log('');
      console.log('⚠️  CRITICAL: Write down your mnemonic phrase and store it safely.');
      console.log('    Run `agentvault wallet export-mnemonic` to see it.');
    });

  cmd.command('show')
    .description('Show wallet address')
    .action(() => {
      const address = getWalletAddress(process.cwd());
      console.log(address);
    });

  cmd.command('sign <message>')
    .description('Sign a message with your wallet')
    .action(async (message: string) => {
      const sig = await signMessage(process.cwd(), message);
      console.log(sig);
    });

  cmd.command('export-mnemonic')
    .description('Show wallet mnemonic phrase for backup/recovery')
    .action(() => {
      console.log('');
      console.log('⚠️  WARNING: Your mnemonic phrase gives full access to your wallet.');
      console.log('    Anyone with this phrase can steal your funds.');
      console.log('    Store it offline in a safe place. Never share it.');
      console.log('');
      const mnemonic = exportMnemonic(process.cwd());
      console.log('Mnemonic phrase:');
      console.log('');
      console.log(`  ${mnemonic}`);
      console.log('');
      console.log('Write this down and store it securely.');
    });

  return cmd;
}
