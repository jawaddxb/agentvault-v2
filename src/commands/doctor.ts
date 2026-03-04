import { Command } from 'commander';
import fs from 'node:fs';
import { resolvePaths } from '../config/paths.js';
import { loadVault } from '../vault/vault.js';
import { listProfiles, loadProfile } from '../profiles/profiles.js';

export function doctorCommand(): Command {
  return new Command('doctor')
    .description('Health check — verify vault integrity, profiles, and configuration')
    .action(() => {
      const dir = process.cwd();
      const paths = resolvePaths(dir);
      let issues = 0;

      console.log('\nAgentVault Health Check\n');

      if (fs.existsSync(paths.base)) {
        console.log('  [OK] AgentVault directory exists');
      } else {
        console.log('  [FAIL] AgentVault not initialized (run `agentvault init`)');
        issues++;
        console.log(`\n${issues} issue(s) found\n`);
        return;
      }

      // .gitignore
      const gitignore = `${paths.base}/.gitignore`;
      if (fs.existsSync(gitignore)) {
        console.log('  [OK] .gitignore present');
      } else {
        console.log('  [FAIL] .gitignore missing -- secrets may be committed!');
        issues++;
      }

      // Profiles
      const profiles = listProfiles(dir);
      if (profiles.length > 0) {
        console.log(`  [OK] ${profiles.length} profile(s) found`);
        for (const name of profiles) {
          try {
            loadProfile(dir, name);
            console.log(`    [OK] ${name} -- valid`);
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            console.log(`    [FAIL] ${name} -- ${msg}`);
            issues++;
          }
        }
      } else {
        console.log('  [FAIL] No profiles found');
        issues++;
      }

      // Vault
      try {
        const secrets = loadVault(dir);
        console.log(`  [OK] Vault readable (${secrets.length} secret(s))`);
      } catch (e: unknown) {
        if (!fs.existsSync(paths.vault)) {
          console.log('  [INFO] Vault file not yet created (no secrets added)');
        } else {
          const msg = e instanceof Error ? e.message : String(e);
          console.log(`  [FAIL] Vault decryption failed -- ${msg}`);
          issues++;
        }
      }

      // Passphrase
      if (fs.existsSync(paths.passphrase)) {
        const pp = fs.readFileSync(paths.passphrase, 'utf-8').trim();
        if (pp.length >= 8) {
          console.log('  [OK] Custom passphrase set');
        } else {
          console.log('  [FAIL] Passphrase too short (< 8 characters)');
          issues++;
        }
        // CRIT-2: Warn about .passphrase file when agents may run
        if (fs.existsSync(paths.auditDb)) {
          console.log('  [WARN] .passphrase file on disk + agents have been run');
          console.log('         Sandboxed agents can read this file. Consider using');
          console.log('         AGENTVAULT_PASSPHRASE env var instead and deleting .passphrase');
          issues++;
        }
      } else if (process.env.AGENTVAULT_PASSPHRASE) {
        console.log('  [OK] Passphrase set via environment variable');
      } else {
        console.log('  [INFO] No passphrase configured');
      }

      // Audit DB
      if (fs.existsSync(paths.auditDb)) {
        console.log('  [OK] Audit database exists');
      } else {
        console.log('  [INFO] Audit database not yet created (no sessions run)');
      }

      console.log(`\n${issues === 0 ? 'All checks passed' : `${issues} issue(s) found`}\n`);
    });
}
