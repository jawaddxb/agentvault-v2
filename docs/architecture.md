# Architecture

## Directory layout

When you run `agentvault init`, a `.agentvault/` directory is created in your project root:

```
.agentvault/
├── vault.json        # Encrypted secrets (AES-256-GCM)
├── memory.json       # Encrypted memory entries (AES-256-GCM)
├── sessions.json     # Active agent session tracking
├── audit.db          # SQLite audit log (append-only)
├── purchased/        # Purchased memory banks (.avault files)
│   └── <bank-name>/
│       ├── bank.avault    # Encrypted bank entries
│       └── license.json   # License terms + access counter
└── profiles/         # Permission profiles (JSON, plaintext)
    ├── restrictive.json
    ├── moderate.json
    └── permissive.json
```

File permissions are enforced at creation:
- `.agentvault/` directory: `0700` (owner only)
- `vault.json`, `memory.json`: `0600` (owner read/write only)
- Profile files: `0644` (world-readable — intentional, they contain no secrets)

---

## Encryption

Every encrypted file uses the same envelope:

```
┌─────────────────────────────────────────┐
│ salt (32 bytes, random per file)        │
│ iv   (12 bytes, random per write)       │
│ authTag (16 bytes, GCM authentication)  │
│ ciphertext (variable)                   │
└─────────────────────────────────────────┘
```

**Key derivation:** scrypt with params `N=16384, r=8, p=1` — the OWASP-recommended minimum for interactive use. Takes ~150ms on modern hardware, which is the intentional rate-limiting factor.

**Cipher:** AES-256-GCM — authenticated encryption. Any tampering with the ciphertext is detected by the auth tag verification.

**Passphrase source (in order of precedence):**
1. `AGENTVAULT_PASSPHRASE` environment variable
2. Interactive prompt (if stdin is a TTY)

The passphrase is never stored anywhere. Every read and write operation derives the key fresh from the passphrase + salt.

---

## File locking

AgentVault uses two layers of concurrency protection:

1. **In-process mutex** (`async-mutex`) — prevents concurrent reads/writes within the same Node.js process
2. **File-system lock** (`<filename>.lock`) — prevents corruption from multiple processes accessing the same vault simultaneously

The lock is released in a `finally` block, so crashes during a write cannot leave a permanent lock file.

---

## Memory search algorithm

When you run `agentvault memory query "webhook stripe verification"`, the following happens:

**1. Keyword extraction from query**

The query is split into tokens. For ASCII text: split on whitespace + punctuation, filter stop words, stem common suffixes. For CJK (Chinese/Japanese/Korean) and Arabic text: bigram extraction (overlapping 2-character windows) to handle languages without whitespace word boundaries.

**2. Keyword extraction on store**

When you call `memory store`, keywords are auto-extracted from the content using the same algorithm. User-provided `--tags` and `--keywords` are merged in. Tags double as keywords.

**3. Composite scoring**

Each memory entry gets a score:

```
score = matchRatio × confidence × freshnessDecay × recencyBoost
```

- **matchRatio**: `matchedTokens / queryTokens` — what fraction of query keywords appear in entry keywords
- **confidence**: the stored confidence value (0.0–1.0, default 0.8)
- **freshnessDecay**: `1.0` if no TTL; otherwise `timeRemaining / ttlDuration` — entries near expiry score lower
- **recencyBoost**: `1.0 + min(accessCount, 10) × 0.01` — frequently accessed entries get up to a 10% bump

Entries with a score above the threshold (default: >0) are returned, sorted by score descending.

**4. Zero results**

If no results match, the response still returns `{ results: [], totalSearched: N }` — so agents know the vault is operational (not empty or broken).

---

## Permission profiles

A profile is a JSON file defining three lists:

```json
{
  "name": "stripe-agent",
  "description": "Agent for Stripe webhook processing",
  "allow": ["STRIPE_*", "NODE_ENV", "PATH"],
  "deny": ["OPENAI_*", "GITHUB_*", "AWS_*"],
  "redact": ["STRIPE_KEY"]
}
```

- `allow`: glob patterns for env vars to pass through
- `deny`: glob patterns to block (deny wins over allow)
- `redact`: keys to pass through but with the value replaced by `[REDACTED]`

When `agentvault wrap -p stripe-agent -- node server.js` is called:
1. The vault is decrypted with the passphrase
2. All secrets matching `allow` (minus `deny`) are injected into the child process environment
3. Secrets in `redact` are injected with `[REDACTED]` value
4. All access events are logged to `audit.db` with timestamp, profile, and key names

---

## Gateway server (v2.0.0+)

The Hono-based gateway (`agentvault gateway start`) exposes:

| Route | Description |
|-------|-------------|
| `GET /health` | Liveness check |
| `GET /banks` | List published memory banks |
| `GET /discover` | Discover banks (with optional keyword filter) |
| `POST /checkout` | Purchase a bank (requires wallet signature) |

The gateway is designed for local network use — it has no auth by default. For production, put it behind a reverse proxy with TLS.
