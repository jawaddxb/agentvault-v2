import { Command } from 'commander';
import { saveProfile, loadProfile, listProfiles, deleteProfile } from '../profiles/profiles.js';
import type { Profile, PermissionRule } from '../types/index.js';

export function profileCommand(): Command {
  const cmd = new Command('profile').description('Manage permission profiles');

  cmd.command('list')
    .description('List all profiles')
    .action(() => {
      const names = listProfiles(process.cwd());
      if (!names.length) { console.log('No profiles. Run `agentvault init` first.'); return; }
      for (const n of names) {
        const p = loadProfile(process.cwd(), n);
        console.log(`  ${p.name} (trust: ${p.trustLevel}, ttl: ${p.ttlSeconds}s) -- ${p.description}`);
      }
    });

  cmd.command('show <name>')
    .description('Show profile details')
    .action((name: string) => {
      const p = loadProfile(process.cwd(), name);
      console.log(`Profile: ${p.name}`);
      console.log(`Description: ${p.description}`);
      console.log(`Trust Level: ${p.trustLevel}`);
      console.log(`TTL: ${p.ttlSeconds}s`);
      console.log('Rules:');
      for (const r of p.rules) console.log(`  ${r.pattern} -> ${r.access}`);
    });

  cmd.command('create <name>')
    .description('Create a new profile')
    .option('-d, --description <desc>', 'Profile description', '')
    .option('-t, --trust <level>', 'Trust level 0-100', '50')
    .option('--ttl <seconds>', 'Token TTL in seconds', '3600')
    .option('-r, --rule <rules...>', 'Rules as "pattern:access" e.g. "AWS_*:deny"')
    .action((name: string, opts) => {
      const rules: PermissionRule[] = (opts.rule || []).map((r: string) => {
        const [pattern, access] = r.split(':');
        if (!['allow', 'deny', 'redact'].includes(access)) {
          console.error(`Invalid access type: ${access}. Use allow/deny/redact.`);
          process.exit(1);
        }
        return { pattern, access: access as PermissionRule['access'] };
      });

      const profile: Profile = {
        name,
        description: opts.description,
        trustLevel: parseInt(opts.trust),
        ttlSeconds: parseInt(opts.ttl),
        rules,
      };
      saveProfile(process.cwd(), profile);
      console.log(`Profile "${name}" created`);
    });

  cmd.command('delete <name>')
    .description('Delete a profile')
    .action((name: string) => {
      const deleted = deleteProfile(process.cwd(), name);
      if (deleted) console.log(`Profile "${name}" deleted`);
      else console.log(`Profile "${name}" not found.`);
    });

  cmd.command('clone <from> <to>')
    .description('Clone a profile as a starting point')
    .action((from: string, to: string) => {
      const original = loadProfile(process.cwd(), from);
      const cloned: Profile = JSON.parse(JSON.stringify(original));
      cloned.name = to;
      saveProfile(process.cwd(), cloned);
      console.log(`Profile "${from}" cloned to "${to}"`);
    });

  return cmd;
}
