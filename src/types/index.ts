/** Encrypted JSON envelope stored on disk */
export interface EncryptedEnvelope {
  salt: string;
  iv: string;
  tag: string;
  data: string;
}

/** Credential vault entry */
export interface VaultEntry {
  key: string;
  value: string;
  addedAt: string;
}

/** Memory entry types (ACSS §11 compliant) */
export type MemoryType = 'knowledge' | 'query_cache' | 'operational';

/** Memory store entry */
export interface MemoryEntry {
  key: string;
  vaultType: 'memory';
  memoryType: MemoryType;
  tags: string[];
  queryHash?: string;
  keywords: string[];
  content: string;
  confidence: number;
  source?: string;
  expiresAt?: string;
  accessCount: number;
  addedAt: string;
}

/** Permission rule within a profile */
export interface PermissionRule {
  pattern: string;
  access: 'allow' | 'deny' | 'redact';
}

/** Agent permission profile */
export interface Profile {
  name: string;
  description: string;
  trustLevel: number;
  ttlSeconds: number;
  rules: PermissionRule[];
}

/** Audit log entry */
export interface AuditEntry {
  id?: number;
  sessionId: string;
  agentId: string;
  profileName: string;
  varName: string;
  action: 'allow' | 'deny' | 'redact';
  timestamp: string;
}

/** Active agent session */
export interface Session {
  id: string;
  agentId: string;
  profileName: string;
  pid: number;
  startedAt: string;
  active: boolean;
}

/** Sandbox execution options */
export interface SandboxOptions {
  projectDir: string;
  profile: Profile;
  command: string;
  agentId: string;
}

/** Access decision for env var evaluation */
export interface AccessDecision {
  varName: string;
  access: 'allow' | 'deny' | 'redact' | 'system';
}

/** License access types */
export type LicenseAccessType =
  | 'unlimited'
  | 'time_locked'
  | 'access_limited'
  | 'time_and_access'
  | 'subscription';

/** License descriptor for purchased bank */
export interface LicenseDescriptor {
  name: string;
  accessType: LicenseAccessType;
  issuedAt: string;
  expiresAt?: string;
  remainingAccesses?: number;
  maxAccesses?: number;
  subscriptionId?: string;
  // v2.0+ wallet fields
  buyerWallet?: string;
  sellerWallet?: string;
  txHash?: string;
  signature?: string;
}

/** Bank descriptor for purchased memory bank */
export interface BankDescriptor {
  schema: 'agentvault-bank-descriptor/1.0';
  name: string;
  description: string;
  entryCount: number;
  contentHash: string;
  tags: string[];
  accessModel: LicenseAccessType;
  previewEntries?: Array<{ key: string; content: string }>;
  createdAt: string;
  // v2.0+ fields (forward-compat)
  sellerWallet?: string;
  price?: string;
}

/** Portable vault format (.avault) */
export interface PortableVault {
  schema: 'agentvault-portable/1.0';
  exportedAt: string;
  entries: VaultEntry[];
  memories: MemoryEntry[];
}

/** Memory-only portable format (.avault) */
export interface MemoryPortable {
  schema: 'agentvault-memory/1.0';
  exportedAt: string;
  memories: MemoryEntry[];
}

/** MCP server error codes */
export type McpErrorCode =
  | 'KEY_NOT_FOUND'
  | 'VAULT_LOCKED'
  | 'VAULT_FULL'
  | 'BUDGET_EXCEEDED'
  | 'RATE_LIMITED'
  | 'UNAUTHORIZED'
  | 'INVALID_INPUT'
  | 'DECRYPTION_FAILED'
  | 'INTERNAL_ERROR'
  | 'LICENSE_EXPIRED'
  | 'ACCESS_LIMIT_REACHED';

/** MCP tool response */
export type McpResponse<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; code: McpErrorCode };

/** MCP budget tracking */
export interface McpBudget {
  pid: number;
  callsThisMinute: number;
  minuteStart: number;
  totalCalls: number;
}
