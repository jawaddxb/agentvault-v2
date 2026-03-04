/** Directory and file names */
export const VAULT_DIR = '.agentvault';
export const VAULT_FILE = 'vault.json';
export const MEMORY_FILE = 'memory.json';
export const PROFILES_DIR = 'profiles';
export const SESSIONS_FILE = 'sessions.json';
export const AUDIT_DB = 'audit.db';
export const MCP_BUDGET_FILE = 'mcp-budget.json';
export const PURCHASED_BANKS_DIR = 'purchased-banks';

/** Encryption */
export const ENCRYPTION_ALGO = 'aes-256-gcm';
export const SCRYPT_N = 16384;
export const SCRYPT_R = 8;
export const SCRYPT_P = 1;
export const SCRYPT_KEYLEN = 32;
export const SALT_BYTES = 32;
export const IV_BYTES = 16;

/** Env var for passphrase */
export const PASSPHRASE_ENV = 'AGENTVAULT_PASSPHRASE';
export const MCP_TOKEN_ENV = 'AGENTVAULT_MCP_TOKEN';

/** System env vars that always pass through sandboxing */
export const SYSTEM_VARS = [
  'PATH', 'HOME', 'USER', 'SHELL', 'TERM',
  'LANG', 'LC_ALL', 'TMPDIR', 'NODE_PATH',
];

/** Vault limits */
export const VAULT_MAX_ENTRIES = 1000;
export const VAULT_MAX_BYTES = 10 * 1024 * 1024; // 10MB
export const VAULT_WARN_PERCENT = 0.8;

/** Memory limits */
export const MEMORY_MAX_ENTRIES = 10000;
export const MEMORY_MAX_BYTES = 50 * 1024 * 1024; // 50MB
export const MEMORY_WARN_PERCENT = 0.8;

/** Memory search */
export const MIN_KEYWORD_LENGTH = 3;
export const MAX_KEYWORDS = 40;
export const MIN_SEARCH_SCORE = 0.1;

/** MCP rate limit */
export const MCP_RATE_LIMIT = 60; // calls per minute
export const MCP_DRAIN_TIMEOUT_MS = 5000;

/** Stopwords for keyword extraction */
export const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'can', 'shall', 'not', 'no', 'nor',
  'so', 'if', 'then', 'else', 'when', 'where', 'how', 'what', 'which',
  'who', 'whom', 'this', 'that', 'these', 'those', 'it', 'its', 'he',
  'she', 'they', 'them', 'their', 'his', 'her', 'my', 'your', 'our',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some',
  'such', 'than', 'too', 'very', 'just', 'about', 'above', 'after',
  'again', 'also', 'any', 'because', 'before', 'between', 'into',
  'only', 'over', 'same', 'still', 'through', 'under', 'until', 'while',
]);
