# AgentVault

**Encrypted credential and memory vault for AI agents.**

Your agent's API keys are in a `.env` file. Its learned knowledge lives in plaintext JSON. Any process on your machine can read both. AgentVault fixes that.

## What it does

- **Encrypted secrets** — AES-256-GCM, random salt per file, scrypt key derivation. Your API keys are encrypted at rest.
- **Encrypted memory** — Your agent stores knowledge as it works. All encrypted. Keyword search runs in-memory after decryption.
- **Permission profiles** — Control which secrets each agent sees. Your coding agent gets GitHub tokens. Your analytics agent gets read-only DB access. Your marketing agent never sees your Stripe keys.
- **Sandboxed execution** — `agentvault wrap -p restrictive "claude-code ."` runs any agent with only the credentials its profile allows.
- **Audit trail** — Every credential access is logged. SQLite, append-only. Who accessed what, when, with which profile.
- **MCP server** — Connect from Claude Code, Cursor, or any MCP-compatible tool. 11 tools for real-time vault access.
- **Portable vaults** — Export encrypted subsets as `.avault` files. Hand them to another machine. Import with a passphrase.

## Install

```bash
npm install -g agentvault
```

## Quick start

```bash
# Initialize vault in your project
agentvault init

# Add secrets
agentvault secret add STRIPE_KEY "sk_live_..."
agentvault secret add OPENAI_KEY "sk-..."

# Store agent knowledge
agentvault memory store stripe-webhooks \
  "Always verify webhook signatures with the raw body, not parsed JSON" \
  -t knowledge --tags stripe webhook

# Search knowledge
agentvault memory query "stripe webhook verification"
# → [0.800] stripe-webhooks (knowledge) -- Always verify webhook...
# 1 result(s) from 3 entries

# Run an agent with controlled access
agentvault wrap -p moderate "claude-code ."

# Start MCP server for live agent connections
agentvault mcp start

# Health check
agentvault doctor
```

## Commands

| Command | Description |
|---------|-------------|
| `init` | Initialize `.agentvault/` with encrypted storage and profiles |
| `secret add/get/list/remove/import` | Manage encrypted credentials |
| `profile list/show/create/delete` | Manage permission profiles |
| `wrap -p <profile> "<command>"` | Run agent in sandboxed environment |
| `memory store/query/list/remove/export/package` | Manage encrypted agent memory |
| `vault export/import` | Portable vault operations (`.avault`) |
| `mcp start` | Start MCP server (stdio transport) |
| `audit show/export/clear` | View credential access logs |
| `status` | Vault status overview |
| `doctor` | Health check and integrity verification |
| `preview -p <profile>` | Dry-run: what an agent would see |
| `diff <profileA> <profileB>` | Compare two profiles |
| `revoke` | Kill active agent sessions |
| `wallet` | Manage the signing wallet for the memory marketplace |
| `publish` | Publish a packaged memory bank to a gateway |
| `discover` | Discover available memory banks on a gateway |
| `checkout` | Purchase a memory bank from a gateway |
| `gateway start` | Start the local gateway server |

## Documentation

- [Architecture](./docs/architecture.md)
- [CLI Reference](./docs/cli-reference.md)
- [Memory Guide](./docs/memory-guide.md)
- [Security](./docs/security.md)
- [MCP Integration](./docs/mcp-integration.md)
- [Memory Marketplace](./docs/memory-marketplace.md)

## Examples

- [Quick Start](./examples/quick-start.sh)
- [AI Agent Workflow](./examples/ai-agent-workflow.sh)
- [Memory Bank Producer](./examples/memory-bank-producer.sh)
- [MCP Server Setup](./examples/mcp-server-setup.md)
- [Advanced Profiles](./examples/advanced-profiles.sh)

## Memory search

Keyword-based search with composite scoring:

```
score = matchRatio × confidence × freshnessDecay × recencyBoost
```

- **matchRatio**: fraction of query tokens matched in entry keywords
- **confidence**: stored confidence score (0.0–1.0)
- **freshnessDecay**: linear decay over TTL
- **recencyBoost**: frequently accessed entries get a small bump (max 10%)

Auto-extracts keywords from content on store. Merges with user-provided keywords.

Zero results return `{ results: [], totalSearched: N }` so agents know the vault isn't empty.

## Permission profiles

Three built-in profiles:

- **restrictive** — Denies everything except system vars. For untrusted agents.
- **moderate** — Allows common dev vars, redacts secrets, denies cloud credentials.
- **permissive** — Allows everything with full audit trail. For trusted agents.

## Security

- AES-256-GCM encryption with random 32-byte salt per file
- scrypt key derivation (N:16384, r:8, p:1)
- File permissions: 0o600 (owner read/write only)
- Directory permissions: 0o700
- No telemetry, no phone-home, no network calls
- Input validation on all keys, values, content, and tags
- `--dry-run` on all destructive operations

## MCP tools

11 tools available when running `agentvault mcp start`:

`vault.secret.get`, `vault.secret.list`, `vault.memory.store`, `vault.memory.query`, `vault.memory.list`, `vault.memory.remove`, `vault.audit.show`, `vault.status`, `vault.profile.show`, `vault.preview`, `vault.export`

## License

MIT
