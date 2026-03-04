# CLI Reference

## Global flags

| Flag | Description |
|------|-------------|
| `--help` | Show help for any command |
| `--version` | Print version |

The passphrase is always read from `AGENTVAULT_PASSPHRASE` env var or interactive prompt. Never passed as a CLI flag (would appear in shell history and `ps` output).

---

## `agentvault init`

Initialize a new vault in the current directory.

```bash
agentvault init
```

Creates `.agentvault/` with default profile files. Prompts for a passphrase if `AGENTVAULT_PASSPHRASE` is not set. Safe to run in an existing vault (no-op if already initialized).

---

## `agentvault secret`

### `secret add <key> <value>`

Add or update a secret.

```bash
agentvault secret add OPENAI_KEY "sk-demo-abc123"
agentvault secret add STRIPE_KEY "sk_live_demo_xyz"
agentvault secret add DATABASE_URL "postgres://user:pass@localhost/mydb"
```

Keys must match `[A-Z][A-Z0-9_]*` (uppercase env-var format). Values can be any string up to 10KB.

### `secret get <key>`

Retrieve a secret value.

```bash
agentvault secret get OPENAI_KEY
# → sk-demo-abc123
```

### `secret list`

List all stored secret keys (not values).

```bash
agentvault secret list
# OPENAI_KEY
# STRIPE_KEY
# DATABASE_URL
```

### `secret remove <key>`

Remove a secret.

```bash
agentvault secret remove STRIPE_KEY
agentvault secret remove STRIPE_KEY --dry-run  # preview only
```

### `secret import <file>`

Bulk-import secrets from a `.env` file.

```bash
agentvault secret import .env.production
```

---

## `agentvault profile`

### `profile list`

List all profiles.

```bash
agentvault profile list
# restrictive   (built-in) Denies everything except system vars
# moderate      (built-in) Common dev vars, redacts secrets
# permissive    (built-in) Allows everything
# stripe-agent  (custom)   Stripe webhook processing
```

### `profile show <name>`

Show a profile's allow/deny/redact rules.

```bash
agentvault profile show moderate
```

### `profile create <name>`

Create a new custom profile interactively.

```bash
agentvault profile create stripe-agent
```

### `profile delete <name>`

Delete a custom profile. Built-in profiles cannot be deleted.

```bash
agentvault profile delete stripe-agent
```

---

## `agentvault wrap`

Run a command in a sandboxed environment with only profile-allowed secrets.

```bash
# Synopsis
agentvault wrap [options] -- <command> [args...]

# Options
-p, --profile <name>   Profile to apply (default: moderate)
```

```bash
# Examples
agentvault wrap -p moderate -- claude-code .
agentvault wrap -p restrictive -- python untrusted_agent.py
agentvault wrap -p permissive -- node deploy.js
agentvault wrap -p stripe-agent -- node webhook-handler.js
```

The child process inherits the current environment PLUS any vault secrets allowed by the profile. Audit entries are created for each accessed secret.

---

## `agentvault memory`

### `memory store <key> <content>` {#memory-store}

Store a memory entry.

```bash
# Synopsis
agentvault memory store <key> <content> [options]

# Options
-t, --type <type>        Memory type (default: knowledge)
                         knowledge | query_cache | operational | fact |
                         observation | preference | procedure | code | error
--tags <tags...>         Tags — space-separated OR comma-separated (auto-split)
-c, --confidence <n>     Confidence score 0.0–1.0 (default: 0.8)
-s, --source <source>    Source identifier string
--ttl <seconds>          Time-to-live in seconds (entry expires after this)
--overwrite              Suppress the duplicate-key warning
```

```bash
# Basic store
agentvault memory store stripe-webhooks \
  "Always verify webhook signatures with the raw body, not parsed JSON"

# With type and tags (space-separated)
agentvault memory store stripe-webhooks \
  "Always verify webhook signatures with the raw body, not parsed JSON" \
  --type knowledge \
  --tags stripe webhook api

# Comma-separated tags also work (new in v2.0.1)
agentvault memory store stripe-webhooks \
  "Always verify webhook signatures with the raw body, not parsed JSON" \
  --tags "stripe,webhook,api"

# High-confidence fact with source
agentvault memory store db-migration-policy \
  "Always run migrations in a transaction. Roll back on any error." \
  --type procedure \
  --confidence 0.99 \
  --source "engineering-handbook-v3"

# Temporary note (expires in 1 hour)
agentvault memory store temp-debug-note \
  "API rate limit hit at 14:23, retry after 60s" \
  --type observation \
  --ttl 3600

# Overwrite existing without warning
agentvault memory store stripe-webhooks \
  "Updated: use Stripe-Signature header, not raw HMAC" \
  --overwrite
```

**Duplicate key behavior:** If the key already exists, the content is overwritten. A warning is printed unless `--overwrite` is passed. Access count resets to 0 on overwrite. Keywords are re-extracted from the new content.

### `memory query <query>`

Search memories by keyword.

```bash
# Synopsis
agentvault memory query <query> [options]

# Options
-n, --limit <n>    Max results (default: 10)
--local-only       Skip purchased banks, only search local memories
```

```bash
agentvault memory query "stripe webhook verification"
# [0.800] stripe-webhooks (knowledge) -- Always verify webhook signatures...
# [0.650] stripe-idempotency (knowledge) -- Use idempotency keys for all...
# 2 result(s) from 47 local entries

agentvault memory query "database migration" --limit 3
agentvault memory query "エラーハンドリング"    # CJK queries work
agentvault memory query "معالجة الأخطاء"       # Arabic queries work
agentvault memory query "api rate limit" --local-only
```

### `memory list`

List memory entries.

```bash
# Synopsis
agentvault memory list [options]

# Options
--tag <tag>        Filter by tag
-t, --type <type>  Filter by memory type
-n, --limit <n>    Max entries to show (default: 100). Use 0 for all.
```

```bash
agentvault memory list
agentvault memory list --tag stripe
agentvault memory list --type procedure
agentvault memory list -n 20           # show first 20
agentvault memory list -n 0            # show all
```

With 100+ entries, shows `... and N more (use --limit 0 to show all)` footer.

### `memory remove <key>`

Remove a memory entry.

```bash
agentvault memory remove stripe-webhooks
agentvault memory remove stripe-webhooks --dry-run
```

### `memory export`

Export all memories to JSON (decrypted).

```bash
agentvault memory export
agentvault memory export -o memories-backup.json
```

### `memory package`

Package local memories into a sellable knowledge bank.

```bash
agentvault memory package \
  --name "stripe-integration-kb" \
  --description "Best practices for Stripe API integration" \
  --since 2025-01-01
```

---

## `agentvault vault`

### `vault export`

Export an encrypted subset of the vault as a portable `.avault` file.

```bash
agentvault vault export -o my-vault.avault
agentvault vault export --keys "OPENAI_KEY,STRIPE_KEY" -o partial.avault
```

The `.avault` file is encrypted with a separate export passphrase (prompted separately from the vault passphrase).

### `vault import`

Import a `.avault` file into the current vault.

```bash
agentvault vault import my-vault.avault
```

---

## `agentvault mcp`

### `mcp start`

Start the MCP server on stdio transport.

```bash
agentvault mcp start
```

This is the command you point your editor's MCP config at. See [mcp-integration.md](./mcp-integration.md) for editor setup.

---

## `agentvault audit`

### `audit show`

Show recent audit log entries.

```bash
agentvault audit show
agentvault audit show --limit 50
agentvault audit show --since 2025-01-01
```

### `audit export`

Export audit log to JSON.

```bash
agentvault audit export -o audit-log.json
```

### `audit clear`

Clear the audit log. Requires confirmation.

```bash
agentvault audit clear
agentvault audit clear --force   # skip confirmation
```

---

## `agentvault status`

Show vault overview: secret count, memory count, profile list, purchased banks.

```bash
agentvault status
```

---

## `agentvault doctor`

Run integrity checks on the vault.

```bash
agentvault doctor
```

Checks: vault file exists and is readable, passphrase is correct, memory file parseable, profiles valid, audit DB accessible, no orphaned lock files.

---

## `agentvault preview`

Dry-run: show what an agent would see when wrapped with a profile.

```bash
agentvault preview -p moderate
agentvault preview -p stripe-agent
```

Shows which secrets would be injected, which would be redacted, and which would be blocked — without actually running anything.

---

## `agentvault diff`

Compare two profiles side by side.

```bash
agentvault diff moderate permissive
agentvault diff restrictive stripe-agent
```

---

## `agentvault revoke`

Kill active agent sessions.

```bash
agentvault revoke              # list active sessions
agentvault revoke --all        # kill all sessions
agentvault revoke <session-id> # kill specific session
```

---

## `agentvault wallet`

Manage the signing wallet for the memory marketplace.

```bash
agentvault wallet create         # generate a new keypair
agentvault wallet show           # show public key / address
agentvault wallet sign <message> # sign a message (for debugging)
```

---

## `agentvault publish`

Publish a packaged memory bank to a gateway.

```bash
agentvault publish \
  --bank stripe-integration-kb \
  --gateway https://av-gateway.example.com \
  --price 0.01
```

---

## `agentvault discover`

Discover available memory banks on a gateway.

```bash
agentvault discover --gateway https://av-gateway.example.com
agentvault discover --gateway https://av-gateway.example.com --query "stripe"
```

---

## `agentvault checkout`

Purchase a memory bank from a gateway.

```bash
agentvault checkout \
  --bank stripe-integration-kb \
  --gateway https://av-gateway.example.com
```

Requires a wallet (`agentvault wallet create`) and sufficient balance.

---

## `agentvault gateway`

Start the local gateway server (for publishing banks).

```bash
agentvault gateway start --port 3000
agentvault gateway start --port 3000 --host 0.0.0.0
```
