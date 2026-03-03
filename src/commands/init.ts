import { Command } from 'commander';
import fs from 'node:fs';
import readline from 'node:readline';
import { resolvePaths } from '../config/paths.js';
import { saveProfile } from '../profiles/profiles.js';
import type { Profile } from '../types/index.js';

const DEFAULT_PROFILES: Profile[] = [
  {
    name: 'restrictive',
    description: 'Minimal access — denies everything except system vars. For untrusted or new agents.',
    trustLevel: 10,
    ttlSeconds: 300,
    rules: [{ pattern: '*', access: 'deny' }],
  },
  {
    name: 'moderate',
    description: 'Balanced — allows common dev vars, redacts secrets, denies cloud credentials.',
    trustLevel: 50,
    ttlSeconds: 3600,
    rules: [
      { pattern: '*', access: 'deny' },
      { pattern: 'NODE_ENV', access: 'allow' },
      { pattern: 'NPM_*', access: 'allow' },
      { pattern: 'DEBUG', access: 'allow' },
      { pattern: 'LOG_LEVEL', access: 'allow' },
      { pattern: 'PORT', access: 'allow' },
      { pattern: 'HOST', access: 'allow' },
      { pattern: 'DATABASE_URL', access: 'redact' },
      { pattern: 'AWS_*', access: 'redact' },
      { pattern: 'OPENAI_*', access: 'redact' },
      { pattern: 'ANTHROPIC_*', access: 'redact' },
    ],
  },
  {
    name: 'permissive',
    description: 'Full access with audit trail — allows everything, logs all access. For trusted agents.',
    trustLevel: 90,
    ttlSeconds: 86400,
    rules: [{ pattern: '*', access: 'allow' }],
  },
];

function askQuestion(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export function initCommand(): Command {
  return new Command('init')
    .description('Initialize AgentVault in the current project')
    .option('--skip-passphrase', 'Skip passphrase prompt and use env var only')
    .action(async (opts) => {
      const dir = process.cwd();
      const paths = resolvePaths(dir);

      if (fs.existsSync(paths.base)) {
        console.log('AgentVault already initialized in this directory.');
        return;
      }

      fs.mkdirSync(paths.profiles, { recursive: true, mode: 0o700 });
      fs.chmodSync(paths.base, 0o700);
      fs.writeFileSync(`${paths.base}/.gitignore`, '*\n!.gitignore\n', { mode: 0o600 });

      for (const profile of DEFAULT_PROFILES) {
        saveProfile(dir, profile);
      }

      if (!opts.skipPassphrase) {
        console.log('');
        console.log('Vault Passphrase Setup');
        console.log('---------------------');
        console.log('Your secrets are encrypted with a passphrase.');
        console.log('You can set a custom one, or press Enter to skip.\n');

        let passphrase = await askQuestion('  Passphrase (Enter to skip): ');

        while (passphrase && passphrase.length < 8) {
          console.log('  Passphrase must be at least 8 characters.');
          passphrase = await askQuestion('  Passphrase (Enter to skip): ');
        }

        if (passphrase) {
          fs.writeFileSync(paths.passphrase, passphrase, { mode: 0o600 });
          console.log('  Custom passphrase saved\n');
        } else {
          console.log('  Set AGENTVAULT_PASSPHRASE env var or create .agentvault/.passphrase later.\n');
        }
      }

      console.log('AgentVault initialized');
      console.log(`  Created: ${paths.base}/`);
      console.log('  Profiles: restrictive, moderate, permissive');
      console.log('');
      console.log('Next steps:');
      console.log('  agentvault secret add AWS_SECRET_ACCESS_KEY "sk-..."');
      console.log('  agentvault wrap --profile moderate "claude-code ."');
    });
}
