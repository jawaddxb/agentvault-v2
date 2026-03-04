import { Command } from 'commander';

export function mcpCommand(): Command {
  const cmd = new Command('mcp').description('MCP server operations');

  cmd.command('start')
    .description('Start the MCP server')
    .option('--transport <type>', 'Transport type: stdio', 'stdio')
    .option('--budget <amount>', 'Max marketplace spend per session (USD)', '0')
    .option('--rate-limit <n>', 'Max tool calls per minute', '60')
    .option('--profile <name>', 'Enforce a permission profile for secret access')
    .action(async (opts) => {
      // Dynamic import to avoid loading MCP SDK at CLI startup
      const { startMcpServer } = await import('../mcp/server.js');
      await startMcpServer({
        transport: opts.transport as 'stdio' | 'sse',
        port: 3100,
        projectDir: process.cwd(),
        budget: parseFloat(opts.budget),
        rateLimit: parseInt(opts.rateLimit),
        profileName: opts.profile as string | undefined,
      });
    });

  return cmd;
}
