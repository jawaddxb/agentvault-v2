import crypto from 'node:crypto';
import { loadVault } from '../vault/vault.js';
import { logAccess } from '../audit/audit.js';
import { evaluateEnv } from './evaluateEnv.js';
import { PASSPHRASE_ENV, MCP_TOKEN_ENV } from '../config/defaults.js';
import type { SandboxOptions } from '../types/index.js';

/** Vars that are NEVER passed to sandboxed agents regardless of profile rules */
const BLOCKED_VARS = new Set([
  PASSPHRASE_ENV,           // AGENTVAULT_PASSPHRASE
  MCP_TOKEN_ENV,            // AGENTVAULT_MCP_TOKEN
  'AGENTVAULT_PASSPHRASE',  // explicit backup
  'AGENTVAULT_MCP_TOKEN',   // explicit backup
]);

/** Build a sandboxed environment and log all access decisions */
export function buildSandboxEnv(
  opts: SandboxOptions,
  sessionId: string
): Record<string, string> {
  const env: Record<string, string> = {};
  const allVars: Record<string, string> = { ...process.env as Record<string, string> };

  // CRIT-3 fix: strip blocked vars BEFORE profile evaluation
  for (const blocked of BLOCKED_VARS) {
    delete allVars[blocked];
  }
  // Also strip any var whose VALUE matches the passphrase (smuggling prevention)
  const passphrase = process.env[PASSPHRASE_ENV];
  if (passphrase) {
    for (const [key, val] of Object.entries(allVars)) {
      if (val === passphrase) {
        delete allVars[key];
      }
    }
  }

  const vaultEntries = loadVault(opts.projectDir);
  for (const entry of vaultEntries) {
    allVars[entry.key] = entry.value;
  }

  const decisions = evaluateEnv(allVars, opts.profile);
  const timestamp = new Date().toISOString();

  for (const decision of decisions) {
    const value = allVars[decision.varName];

    if (decision.access !== 'system') {
      logAccess(opts.projectDir, {
        sessionId,
        agentId: opts.agentId,
        profileName: opts.profile.name,
        varName: decision.varName,
        action: decision.access,
        timestamp,
      });
    }

    if (decision.access === 'system' || decision.access === 'allow') {
      env[decision.varName] = value;
    } else if (decision.access === 'redact') {
      env[decision.varName] = `VAULT_REDACTED_${crypto.randomBytes(4).toString('hex')}`;
    }
    // deny → excluded
  }

  env['AGENTVAULT_SESSION'] = sessionId;
  env['AGENTVAULT_PROFILE'] = opts.profile.name;
  env['AGENTVAULT_TRUST'] = String(opts.profile.trustLevel);

  return env;
}
