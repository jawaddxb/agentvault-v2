import fs from 'node:fs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { resolvePaths } from '../config/paths.js';
import { getSecret, listSecretKeys } from '../vault/vault.js';
import { storeMemory, queryMemories, listMemories, removeMemory, exportMemories } from '../memory/memory.js';
import { checkLicense, consumeAccess, loadBankEntries, listPurchasedBanks, loadLicense } from '../license/license.js';
import { searchMemories } from '../memory/search.js';
import { queryAudit, logAccess } from '../audit/audit.js';
import { listProfiles, loadProfile, checkAccess } from '../profiles/profiles.js';
import { loadVault } from '../vault/vault.js';
import { evaluateEnv } from '../sandbox/evaluateEnv.js';
import { exportPortable } from '../portable/portable.js';
import { getPassphrase } from '../vault/encryption.js';
import { vaultMutex } from '../memory/mutex.js';
import { MCP_RATE_LIMIT, MCP_DRAIN_TIMEOUT_MS, MCP_TOKEN_ENV } from '../config/defaults.js';
import type { McpResponse, McpBudget, McpErrorCode, MemoryType, Profile } from '../types/index.js';

// M6: Read version from package.json
const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8')) as { version: string };

function ok<T>(data: T): McpResponse<T> {
  return { success: true, data };
}

function fail(error: string, code: McpErrorCode): McpResponse {
  return { success: false, error, code };
}

interface McpServerOptions {
  transport: 'stdio' | 'sse';
  port: number;
  projectDir: string;
  budget?: number;
  rateLimit?: number;
  profileName?: string; // H2: optional profile enforcement
}

/** Rate limiter state — initialized fresh, may be inherited from previous session */
let budget: McpBudget = {
  pid: process.pid,
  callsThisMinute: 0,
  minuteStart: Date.now(),
  totalCalls: 0,
};

/** Try to inherit budget from a recently-crashed previous session */
function tryInheritBudget(projectDir: string): void {
  const budgetPath = resolvePaths(projectDir).mcpBudget;
  try {
    if (!fs.existsSync(budgetPath)) return;
    const prev = JSON.parse(fs.readFileSync(budgetPath, 'utf-8')) as McpBudget;
    const ageMs = Date.now() - prev.minuteStart;
    // Only inherit if previous session was <5min ago (likely crash recovery)
    if (ageMs < 5 * 60 * 1000 && prev.pid !== process.pid) {
      budget.totalCalls = prev.totalCalls;
      console.error(`Inherited budget from previous session (PID ${prev.pid}): ${prev.totalCalls} total calls`);
    }
  } catch {
    // Best-effort
  }
}

let configuredRateLimit = MCP_RATE_LIMIT;

function checkRateLimit(): McpResponse | null {
  const now = Date.now();
  if (now - budget.minuteStart > 60000) {
    budget.callsThisMinute = 0;
    budget.minuteStart = now;
  }
  if (budget.callsThisMinute >= configuredRateLimit) {
    return fail(`Rate limit exceeded: ${configuredRateLimit} calls/minute`, 'RATE_LIMITED');
  }
  budget.callsThisMinute++;
  budget.totalCalls++;
  return null;
}

function saveBudget(projectDir: string): void {
  const budgetPath = resolvePaths(projectDir).mcpBudget;
  try {
    fs.mkdirSync(path.dirname(budgetPath), { recursive: true });
    fs.writeFileSync(budgetPath, JSON.stringify(budget, null, 2));
  } catch {
    // Best-effort budget persistence
  }
}

// H2: Check if a secret key is accessible under the active profile
function checkSecretAccess(key: string, profile: Profile | null): 'allow' | 'deny' | 'redact' {
  if (!profile) return 'allow'; // No profile = allow all (backward compat)
  return checkAccess(profile, key);
}

// H2: Log secret access to audit log when profile is active
function logSecretAudit(
  projectDir: string,
  key: string,
  action: 'allow' | 'deny' | 'redact',
  profile: Profile | null
): void {
  if (!profile) return; // Only audit when profile is active
  try {
    logAccess(projectDir, {
      sessionId: `mcp-${process.pid}`,
      agentId: 'mcp-client',
      profileName: profile.name,
      varName: key,
      action,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Best-effort audit logging
  }
}

const TOOLS = [
  {
    name: 'vault.secret.get',
    description: 'Get a secret value from the vault',
    inputSchema: {
      type: 'object' as const,
      properties: { key: { type: 'string', description: 'Secret key name' } },
      required: ['key'],
    },
  },
  {
    name: 'vault.secret.list',
    description: 'List all secret keys in the vault',
    inputSchema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'vault.memory.store',
    description: 'Store a memory entry',
    inputSchema: {
      type: 'object' as const,
      properties: {
        key: { type: 'string', description: 'Memory key' },
        content: { type: 'string', description: 'Memory content' },
        memoryType: { type: 'string', enum: ['knowledge', 'query_cache', 'operational'] },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags' },
        confidence: { type: 'number', description: 'Confidence 0-1' },
        source: { type: 'string', description: 'Source identifier' },
        ttlSeconds: { type: 'number', description: 'Time-to-live in seconds' },
      },
      required: ['key', 'content', 'memoryType'],
    },
  },
  {
    name: 'vault.memory.query',
    description: 'Search memories by keyword query',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results' },
      },
      required: ['query'],
    },
  },
  {
    name: 'vault.memory.list',
    description: 'List all memory entries',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tag: { type: 'string' },
        memoryType: { type: 'string' },
      },
    },
  },
  {
    name: 'vault.memory.remove',
    description: 'Remove a memory entry by key',
    inputSchema: {
      type: 'object' as const,
      properties: { key: { type: 'string', description: 'Memory key to remove' } },
      required: ['key'],
    },
  },
  {
    name: 'vault.audit.show',
    description: 'Show recent audit log entries',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sessionId: { type: 'string' },
        agentId: { type: 'string' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'vault.status',
    description: 'Show vault status',
    inputSchema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'vault.profile.show',
    description: 'Show a profile details',
    inputSchema: {
      type: 'object' as const,
      properties: { name: { type: 'string', description: 'Profile name' } },
      required: ['name'],
    },
  },
  {
    name: 'vault.preview',
    description: 'Preview env var access for a profile',
    inputSchema: {
      type: 'object' as const,
      properties: { profile: { type: 'string', description: 'Profile name' } },
      required: ['profile'],
    },
  },
  {
    name: 'vault.export',
    description: 'Export vault to portable format',
    inputSchema: {
      type: 'object' as const,
      properties: {
        outputPath: { type: 'string', description: 'Output file path' },
        passphrase: { type: 'string', description: 'Export passphrase' },
      },
      required: ['outputPath', 'passphrase'],
    },
  },
];

async function handleTool(
  name: string,
  args: Record<string, unknown>,
  projectDir: string,
  activeProfile: Profile | null
): Promise<McpResponse> {
  try {
    switch (name) {
      case 'vault.secret.get': {
        const key = args.key as string;
        if (!key) return fail('Missing key parameter', 'INVALID_INPUT');

        // H2 + M2: check profile access under mutex
        return await vaultMutex.runExclusive(async () => {
          const access = checkSecretAccess(key, activeProfile);
          logSecretAudit(projectDir, key, access, activeProfile);

          if (access === 'deny') {
            return fail(`Access denied to secret: ${key}`, 'UNAUTHORIZED');
          }

          const value = getSecret(projectDir, key);
          if (value === undefined) return fail(`Secret not found: ${key}`, 'KEY_NOT_FOUND');

          if (access === 'redact') {
            return ok({ key, value: '[REDACTED]' });
          }

          return ok({ key, value });
        });
      }

      case 'vault.secret.list': {
        // H2 + M2: filter keys by profile under mutex
        return await vaultMutex.runExclusive(async () => {
          const allKeys = listSecretKeys(projectDir);

          if (!activeProfile) {
            return ok({ keys: allKeys, count: allKeys.length });
          }

          // Filter denied keys; mark redacted keys
          const filtered = allKeys
            .map(key => {
              const access = checkSecretAccess(key, activeProfile);
              logSecretAudit(projectDir, key, access, activeProfile);
              return { key, access };
            })
            .filter(({ access }) => access !== 'deny')
            .map(({ key, access }) => access === 'redact' ? `${key} [REDACTED]` : key);

          return ok({ keys: filtered, count: filtered.length });
        });
      }

      case 'vault.memory.store': {
        const entry = await storeMemory(projectDir, {
          key: args.key as string,
          content: args.content as string,
          memoryType: args.memoryType as MemoryType,
          tags: args.tags as string[] | undefined,
          confidence: args.confidence as number | undefined,
          source: args.source as string | undefined,
          ttlSeconds: args.ttlSeconds as number | undefined,
        });
        return ok({ key: entry.key, keywords: entry.keywords.length });
      }

      case 'vault.memory.query': {
        const query = args.query as string;
        if (!query) return fail('Missing query parameter', 'INVALID_INPUT');
        const maxResults = (args.limit as number) || 10;
        const response = await queryMemories(projectDir, query, maxResults);

        // Also search purchased banks with valid licenses
        const bankResults: Array<{ key: string; score: number; memoryType: string; content: string; tags: string[]; source: string }> = [];
        try {
          const banks = listPurchasedBanks(projectDir);
          for (const bankName of banks) {
            const license = loadLicense(projectDir, bankName);
            const check = checkLicense(license);
            if (!check.valid) continue;

            const bankEntries = loadBankEntries(projectDir, bankName);
            const bankSearch = searchMemories(bankEntries, query, 5);
            for (const r of bankSearch.results) {
              bankResults.push({
                key: r.entry.key,
                score: r.score,
                memoryType: r.entry.memoryType,
                content: r.entry.content,
                tags: r.entry.tags,
                source: `bank:${bankName}`,
              });
            }
            // Consume access for metered licenses
            if (bankSearch.results.length > 0) {
              consumeAccess(projectDir, bankName);
            }
          }
        } catch {
          // Best-effort bank search — don't fail the whole query
        }

        // Merge local + bank results, sort by score
        const allResults = [
          ...response.results.map(r => ({
            key: r.entry.key,
            score: r.score,
            memoryType: r.entry.memoryType,
            content: r.entry.content,
            tags: r.entry.tags,
            source: 'local',
          })),
          ...bankResults,
        ].sort((a, b) => b.score - a.score).slice(0, maxResults);

        return ok({
          results: allResults,
          totalSearched: response.totalSearched,
        });
      }

      case 'vault.memory.list': {
        const entries = await listMemories(projectDir, {
          tag: args.tag as string | undefined,
          memoryType: args.memoryType as MemoryType | undefined,
        });
        return ok(entries);
      }

      case 'vault.memory.remove': {
        const key = args.key as string;
        if (!key) return fail('Missing key parameter', 'INVALID_INPUT');
        const removed = await removeMemory(projectDir, key);
        if (!removed) return fail(`Memory not found: ${key}`, 'KEY_NOT_FOUND');
        return ok({ removed: true });
      }

      case 'vault.audit.show': {
        const entries = queryAudit(projectDir, {
          sessionId: args.sessionId as string | undefined,
          agentId: args.agentId as string | undefined,
          limit: (args.limit as number) || 50,
        });
        return ok(entries);
      }

      case 'vault.status': {
        const profiles = listProfiles(projectDir);
        let secretCount = 0;
        try { secretCount = listSecretKeys(projectDir).length; } catch { /* */ }
        return ok({ profiles, secretCount });
      }

      case 'vault.profile.show': {
        const pName = args.name as string;
        if (!pName) return fail('Missing name parameter', 'INVALID_INPUT');
        const profile = loadProfile(projectDir, pName);
        return ok(profile);
      }

      case 'vault.preview': {
        const profileName = args.profile as string;
        if (!profileName) return fail('Missing profile parameter', 'INVALID_INPUT');
        const profile = loadProfile(projectDir, profileName);
        const allVars: Record<string, string> = { ...process.env as Record<string, string> };
        try {
          for (const entry of loadVault(projectDir)) {
            allVars[entry.key] = entry.value;
          }
        } catch { /* */ }
        const decisions = evaluateEnv(allVars, profile);
        return ok(decisions);
      }

      case 'vault.export': {
        const outputPath = args.outputPath as string;
        const passphrase = args.passphrase as string;
        if (!outputPath || !passphrase) return fail('Missing outputPath or passphrase', 'INVALID_INPUT');
        // H1 fix: restrict export to within .agentvault/ directory
        const resolvedOutput = path.resolve(outputPath);
        const vaultBase = path.resolve(resolvePaths(projectDir).base);
        if (!resolvedOutput.startsWith(vaultBase)) {
          return fail('Export path must be within .agentvault/ directory when called via MCP', 'UNAUTHORIZED');
        }
        exportPortable(projectDir, outputPath, passphrase);
        return ok({ exported: true, path: outputPath });
      }

      default:
        return fail(`Unknown tool: ${name}`, 'INVALID_INPUT');
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('passphrase') || msg.includes('decryption') || msg.includes('Decryption')) {
      return fail(msg, 'DECRYPTION_FAILED');
    }
    if (msg.includes('full') || msg.includes('Full')) {
      return fail(msg, 'VAULT_FULL');
    }
    return fail(msg, 'INTERNAL_ERROR');
  }
}

export async function startMcpServer(options: McpServerOptions): Promise<void> {
  const { projectDir } = options;
  configuredRateLimit = options.rateLimit ?? MCP_RATE_LIMIT;
  tryInheritBudget(projectDir);

  // H2: Load profile at startup if specified
  let activeProfile: Profile | null = null;
  if (options.profileName) {
    try {
      activeProfile = loadProfile(projectDir, options.profileName);
      console.error(`Profile enforcement active: ${options.profileName}`);
    } catch (e) {
      console.error(`Failed to load profile '${options.profileName}': ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    }
  }

  // M6: Use version from package.json
  const server = new Server(
    { name: 'agentvault', version: pkg.version },
    { capabilities: { tools: {}, resources: {} } }
  );

  // List tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  // Call tool
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const rateLimitErr = checkRateLimit();
    if (rateLimitErr) {
      return {
        content: [{ type: 'text', text: JSON.stringify(rateLimitErr) }],
        isError: true,
      };
    }

    const result = await handleTool(
      request.params.name,
      (request.params.arguments ?? {}) as Record<string, unknown>,
      projectDir,
      activeProfile
    );

    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
      isError: !result.success,
    };
  });

  // System prompt resource
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [{
      uri: 'agentvault://system-prompt',
      name: 'AgentVault System Prompt',
      description: 'Auto-learn instruction for connected agents',
      mimeType: 'text/plain',
    }],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    if (request.params.uri === 'agentvault://system-prompt') {
      return {
        contents: [{
          uri: 'agentvault://system-prompt',
          mimeType: 'text/plain',
          text: [
            'You have access to AgentVault — an encrypted credential and memory vault.',
            '',
            'BEFORE generating an answer, ALWAYS check memory first:',
            '  vault.memory.query "<topic>" — search for existing knowledge',
            '',
            'If memory has a relevant result (score > 0.5), USE it instead of generating from scratch.',
            'If memory returns no results, generate normally, then STORE the valuable parts:',
            '  vault.memory.store — save with a descriptive key, type "knowledge", and relevant tags',
            '',
            'Key guidelines:',
            '- Keys should be descriptive: "stripe-webhook-verification", not "item-1"',
            '- Tags should be domain terms: --tags stripe webhook security',
            '- Set confidence based on how sure you are (0.0-1.0)',
            '- Set source to identify where the knowledge came from',
            '- Use type "knowledge" for facts, "query_cache" for expensive lookups, "operational" for config/state',
            '- Use vault.secret.get to access API credentials when needed',
            '',
            'All access is encrypted and audited.',
          ].join('\n'),
        }],
      };
    }
    throw new Error(`Unknown resource: ${request.params.uri}`);
  });

  // Signal handling
  const cleanup = () => {
    saveBudget(projectDir);
    setTimeout(() => process.exit(0), MCP_DRAIN_TIMEOUT_MS);
  };
  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);

  if (options.transport !== 'stdio') {
    console.error('SSE transport is not available in v1.0. Use --transport stdio (default).');
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('AgentVault MCP server running on stdio');
}
