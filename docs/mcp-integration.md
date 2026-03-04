# MCP Integration

AgentVault's MCP server exposes 11 tools over stdio transport. Any MCP-compatible client (Claude Desktop, Cursor, Zed, Claude Code) can use these tools to access the vault in real time.

---

## Quick setup

```bash
# 1. Make sure your vault is initialized
cd /your/project
agentvault init

# 2. Test the MCP server starts
AGENTVAULT_PASSPHRASE=your-passphrase agentvault mcp start
# Should print nothing (MCP servers communicate via stdio)
# Ctrl+C to stop
```

---

## Editor configuration

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "agentvault": {
      "command": "agentvault",
      "args": ["mcp", "start"],
      "env": {
        "AGENTVAULT_PASSPHRASE": "your-passphrase"
      }
    }
  }
}
```

Restart Claude Desktop. You'll see AgentVault tools available in the tools panel.

### Cursor

Edit `~/.cursor/mcp.json` (or Cursor → Settings → MCP):

```json
{
  "mcpServers": {
    "agentvault": {
      "command": "agentvault",
      "args": ["mcp", "start"],
      "env": {
        "AGENTVAULT_PASSPHRASE": "your-passphrase"
      },
      "cwd": "/your/project"
    }
  }
}
```

### Zed

In your Zed `settings.json`:

```json
{
  "context_servers": {
    "agentvault": {
      "command": {
        "path": "agentvault",
        "args": ["mcp", "start"],
        "env": {
          "AGENTVAULT_PASSPHRASE": "your-passphrase"
        }
      }
    }
  }
}
```

### Claude Code (claude-code CLI)

Create a `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "agentvault": {
      "command": "agentvault",
      "args": ["mcp", "start"],
      "env": {
        "AGENTVAULT_PASSPHRASE": "your-passphrase"
      }
    }
  }
}
```

Or pass inline when starting Claude Code:

```bash
AGENTVAULT_PASSPHRASE=your-passphrase claude --mcp-server "agentvault mcp start" .
```

---

## Tools {#tools}

### `vault.secret.get`

Retrieve a secret value.

```json
{
  "name": "vault.secret.get",
  "parameters": {
    "key": "OPENAI_KEY"
  }
}
```

Returns: `{ "value": "sk-..." }`

### `vault.secret.list`

List all secret keys (not values).

```json
{
  "name": "vault.secret.list",
  "parameters": {}
}
```

Returns: `{ "keys": ["OPENAI_KEY", "STRIPE_KEY", "DATABASE_URL"] }`

### `vault.memory.store`

Store a memory entry.

```json
{
  "name": "vault.memory.store",
  "parameters": {
    "key": "stripe-webhook-tip",
    "content": "Always verify webhook signatures with raw body, not parsed JSON",
    "memoryType": "knowledge",
    "tags": ["stripe", "webhook"],
    "confidence": 0.95
  }
}
```

Returns: `{ "key": "stripe-webhook-tip", "keywords": 8 }`

### `vault.memory.query`

Search memories by keyword.

```json
{
  "name": "vault.memory.query",
  "parameters": {
    "query": "stripe webhook verification",
    "limit": 5
  }
}
```

Returns: `{ "results": [{ "key": "...", "score": 0.8, "content": "...", "memoryType": "knowledge" }], "totalSearched": 47 }`

### `vault.memory.list`

List all memory entries (metadata only, no content).

```json
{
  "name": "vault.memory.list",
  "parameters": {
    "tag": "stripe",
    "memoryType": "knowledge"
  }
}
```

Returns: array of `{ key, memoryType, tags, contentLength, accessCount, addedAt }`

### `vault.memory.remove`

Remove a memory entry.

```json
{
  "name": "vault.memory.remove",
  "parameters": {
    "key": "stripe-webhook-tip"
  }
}
```

Returns: `{ "removed": true }`

### `vault.audit.show`

Show recent audit log entries.

```json
{
  "name": "vault.audit.show",
  "parameters": {
    "limit": 20
  }
}
```

Returns: array of audit records.

### `vault.status`

Get vault overview.

```json
{
  "name": "vault.status",
  "parameters": {}
}
```

Returns: `{ "secretCount": 12, "memoryCount": 47, "profiles": [...], "healthy": true }`

### `vault.profile.show`

Show a profile's rules.

```json
{
  "name": "vault.profile.show",
  "parameters": {
    "name": "moderate"
  }
}
```

Returns: `{ "name": "moderate", "allow": [...], "deny": [...], "redact": [...] }`

### `vault.preview`

Dry-run: what would an agent see with this profile?

```json
{
  "name": "vault.preview",
  "parameters": {
    "profile": "stripe-agent"
  }
}
```

Returns: `{ "injected": ["STRIPE_KEY"], "redacted": ["STRIPE_WEBHOOK_SECRET"], "denied": ["OPENAI_KEY"] }`

### `vault.export`

Export memories to JSON.

```json
{
  "name": "vault.export",
  "parameters": {}
}
```

Returns: full decrypted memory entries array.

---

## Using AgentVault from Claude Code — full walkthrough

Here's a complete session showing how Claude Code can use AgentVault as its memory:

### Step 1: Start Claude Code with AgentVault

```bash
cd /your/project
AGENTVAULT_PASSPHRASE=your-passphrase claude --mcp-server "agentvault mcp start" .
```

### Step 2: Claude Code stores knowledge it learns

During the session, Claude Code calls `vault.memory.store` automatically when it learns something worth remembering:

> "I just discovered that this project uses Tailwind v4 beta with a custom plugin for component variants. Let me store that."

```json
vault.memory.store({
  "key": "project-tailwind-version",
  "content": "Uses Tailwind CSS v4 beta with custom plugin at ./plugins/variants.ts for component variant support",
  "memoryType": "knowledge",
  "tags": ["tailwind", "css", "frontend", "project-specific"],
  "confidence": 0.95
})
```

### Step 3: Claude Code queries before making decisions

Before touching CSS, Claude Code queries first:

```json
vault.memory.query({ "query": "tailwind CSS configuration" })
```

Gets back: `"Uses Tailwind CSS v4 beta with custom plugin..."` — and applies the right approach immediately without asking you again.

### Step 4: Check the audit trail

```bash
agentvault audit show
# 2026-03-04 05:00:15  memory.query  "tailwind CSS"    agent=claude-code
# 2026-03-04 05:00:22  memory.store  project-tailwind  agent=claude-code
```

---

## Troubleshooting

**MCP server won't start**

```bash
# Check if agentvault is in PATH
which agentvault

# Check the vault is initialized
ls .agentvault/vault.json

# Test the passphrase manually
AGENTVAULT_PASSPHRASE=your-passphrase agentvault doctor
```

**"No tools available" in the editor**

The MCP server uses stdio transport. Ensure:
1. The `command` path resolves correctly (use `which agentvault` to find full path if needed)
2. `AGENTVAULT_PASSPHRASE` is set in the MCP server env config
3. The `cwd` (if specified) contains a `.agentvault/` directory

**"Passphrase incorrect" error**

The passphrase in your editor config must match the passphrase used when running `agentvault init`. If you changed it, re-initialize or update the editor config.

**MCP server crashes on startup**

Check for orphaned lock files:

```bash
ls .agentvault/*.lock
rm .agentvault/*.lock
```
