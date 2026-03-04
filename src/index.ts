#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { secretCommand } from './commands/secret.js';
import { profileCommand } from './commands/profile.js';
import { auditCommand } from './commands/audit.js';
import { revokeCommand } from './commands/revoke.js';
import { statusCommand } from './commands/status.js';
import { previewCommand } from './commands/preview.js';
import { doctorCommand } from './commands/doctor.js';
import { diffCommand } from './commands/diff.js';
import { wrapCommand } from './commands/wrap.js';
import { memoryCommand } from './commands/memory.js';
import { memoryPackageCommand } from './commands/memoryPackage.js';
import { vaultCommand } from './commands/vault.js';
import { mcpCommand } from './commands/mcp.js';
import { walletCommand } from './commands/wallet.js';
import { gatewayCommand } from './commands/gateway.js';
import { publishCommand } from './commands/publish.js';
import { discoverCommand } from './commands/discover.js';
import { checkoutCommand } from './commands/checkout.js';
import { exportCommand } from './commands/export.js';

// Read version from package.json
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));

// Global error handler — clean errors instead of stack traces
process.on('uncaughtException', (err) => {
  const msg = err.message || String(err);
  if (msg.includes('authenticate data') || msg.includes('Decryption')) {
    console.error('Error: Wrong passphrase or corrupted vault. Check your AGENTVAULT_PASSPHRASE.');
  } else if (msg.includes('is required') || msg.includes('is invalid') || msg.includes('exceeds') || msg.includes('must not contain')) {
    console.error(`Error: ${msg}`);
  } else if (msg.includes('ENOENT') || msg.includes('not found')) {
    console.error(`Error: ${msg}`);
  } else {
    console.error(`Error: ${msg}`);
  }
  process.exit(1);
});

const program = new Command();

program
  .name('agentvault')
  .description('Encrypted agent credential and memory vault with MCP server')
  .version(pkg.version);

program.addCommand(initCommand());
program.addCommand(secretCommand());
program.addCommand(profileCommand());
program.addCommand(auditCommand());
program.addCommand(revokeCommand());
program.addCommand(statusCommand());
program.addCommand(previewCommand());
program.addCommand(doctorCommand());
program.addCommand(diffCommand());
program.addCommand(wrapCommand());

// Memory commands
const memory = memoryCommand();
memory.addCommand(memoryPackageCommand());
program.addCommand(memory);

program.addCommand(vaultCommand());
program.addCommand(mcpCommand());
program.addCommand(exportCommand());

// Stage 4: Gateway commands
program.addCommand(walletCommand());
program.addCommand(gatewayCommand());
program.addCommand(publishCommand());
program.addCommand(discoverCommand());
program.addCommand(checkoutCommand());

program.parse();
