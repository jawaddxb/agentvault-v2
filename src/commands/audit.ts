import { Command } from 'commander';
import fs from 'node:fs';
import { queryAudit, exportAudit, clearAudit } from '../audit/audit.js';

export function auditCommand(): Command {
  const cmd = new Command('audit').description('View credential access audit logs');

  cmd.command('show')
    .description('Show audit log entries')
    .option('-s, --session <id>', 'Filter by session ID')
    .option('-a, --agent <id>', 'Filter by agent ID')
    .option('-n, --limit <n>', 'Number of entries', '50')
    .action((opts) => {
      const entries = queryAudit(process.cwd(), {
        sessionId: opts.session,
        agentId: opts.agent,
        limit: parseInt(opts.limit),
      });

      if (!entries.length) { console.log('No audit entries found.'); return; }

      const hdr = `${'TIME'.padEnd(24)} ${'SESSION'.padEnd(10)} ${'AGENT'.padEnd(16)} ${'PROFILE'.padEnd(14)} ${'VAR'.padEnd(28)} ACTION`;
      console.log(hdr);
      console.log('-'.repeat(hdr.length));
      for (const e of entries) {
        const time = e.timestamp.replace('T', ' ').slice(0, 23);
        console.log(
          `${time} ${e.sessionId.slice(0, 8).padEnd(10)} ${e.agentId.padEnd(16)} ` +
          `${e.profileName.padEnd(14)} ${e.varName.padEnd(28)} ${e.action}`
        );
      }
      console.log(`\n${entries.length} entries`);
    });

  cmd.command('export')
    .description('Export audit logs to JSON or CSV')
    .option('-o, --output <file>', 'Output file path')
    .option('-f, --format <format>', 'Output format: json or csv', 'json')
    .action((opts) => {
      const entries = exportAudit(process.cwd());
      if (!entries.length) { console.log('No audit entries to export.'); return; }

      let content: string;
      if (opts.format === 'csv') {
        function csvEscape(val: string): string {
          const s = String(val ?? '');
          if (s.includes(',') || s.includes('"') || s.includes('\n')) {
            return `"${s.replace(/"/g, '""')}"`;
          }
          return s;
        }
        const header = 'id,sessionId,agentId,profileName,varName,action,timestamp';
        const rows = entries.map(e =>
          [e.id, e.sessionId, e.agentId, e.profileName, e.varName, e.action, e.timestamp]
            .map(f => csvEscape(String(f ?? '')))
            .join(',')
        );
        content = [header, ...rows].join('\n');
      } else {
        content = JSON.stringify(entries, null, 2);
      }

      if (opts.output) {
        fs.writeFileSync(opts.output, content);
        console.log(`Exported ${entries.length} entries to ${opts.output}`);
      } else {
        console.log(content);
      }
    });

  cmd.command('clear')
    .description('Clear all audit logs')
    .option('--dry-run', 'Preview without clearing')
    .action((opts) => {
      if (opts.dryRun) {
        const entries = exportAudit(process.cwd());
        console.log(`[DRY RUN] Would clear ${entries.length} audit entries`);
        return;
      }
      clearAudit(process.cwd());
      console.log('Audit log cleared');
    });

  return cmd;
}
