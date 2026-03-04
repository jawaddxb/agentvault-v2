# MCP Server Setup Guide

This guide shows how to connect AgentVault to Claude Desktop, Cursor, Zed, and Claude Code via the Model Context Protocol (MCP).

Once connected, your AI agent can read from and write to your encrypted vault directly during the coding session — no copy-pasting API keys, no plaintext `.env` files.

---

## Prerequisites

```bash
# Install AgentVault globally
npm install -g agentvault

# Initialize a vault in your project
cd /your/project
agentvault init

# Verify it works
AGENTVAULT_PASSPHRASE=your-passphrase agentvault doctor
```

---

## Claude Desktop

1. Open Claude Desktop
2. Go to **Settings → Developer → Edit Config**
3. Add AgentVault to your `claude_desktop_config.json`:

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

4. Restart Claude Desktop
5. You'll see AgentVault tools in the tool picker (🔧 icon)

**Security note:** If you don't want your passphrase in the config file, use a shell wrapper:

```json
{
  "mcpServers": {
    "agentvault": {
      "command": "/bin/bash",
      "args": ["-c", "source ~/.zshrc && agentvault mcp start"]
    }
  }
}
```

This sources your shell profile where `AGENTVAULT_PASSPHRASE` is exported from your password manager.

---

## Cursor

1. Open Cursor → **Settings** (Cmd+,) → search "MCP"
2. Or edit `~/.cursor/mcp.json` directly:

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

3. Restart Cursor

> **Tip:** Set `cwd` to your project directory so AgentVault finds the right `.agentvault/` vault.

---

## Zed

In your Zed `settings.json` (`Cmd+,`):

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

---

## Claude Code (CLI)

### Option A: Project-level config

Create `.mcp.json` in your project root:

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

Then run Claude Code normally:
```bash
cd /your/project
claude .
```

### Option B: Global config

Edit `~/.claude/config.json`:

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

### Option C: Inline at startup

```bash
AGENTVAULT_PASSPHRASE=your-passphrase \
  claude --mcp-server "agentvault mcp start" .
```

---

## Available tools (all 11)

Once connected, these tools are available to the AI agent:

| Tool | What it does |
|------|-------------|
| `vault.secret.get` | Retrieve a secret value by key |
| `vault.secret.list` | List all secret keys (not values) |
| `vault.memory.store` | Store a memory entry |
| `vault.memory.query` | Search memories by keyword |
| `vault.memory.list` | List all memories (metadata only) |
| `vault.memory.remove` | Remove a memory entry |
| `vault.audit.show` | View credential access log |
| `vault.status` | Vault health overview |
| `vault.profile.show` | Show profile allow/deny/redact rules |
| `vault.preview` | Dry-run: what agent sees with a profile |
| `vault.export` | Export all memories to JSON |

---

## Full walkthrough: Claude Code + AgentVault

Here's what a real session looks like:

```
You: Build a Stripe webhook handler for subscription events

Claude: Let me check what I know about Stripe webhooks first.
[calls vault.memory.query("stripe webhook signature verification")]
→ [0.850] stripe-webhook-policy (knowledge) -- Always verify signatures with raw body...

I found a relevant note. I'll use that pattern.
[builds webhook handler correctly on first try]
...

When I encounter that the project uses Railway:
[calls vault.memory.store({
  key: "project-deploy-target",
  content: "Deployed on Railway.app. STRIPE_KEY and STRIPE_WEBHOOK_SECRET set via Railway dashboard.",
  memoryType: "fact",
  tags: ["deployment", "stripe", "railway"]
})]

Now, let me get the Stripe key to test the webhook locally:
[calls vault.secret.get("STRIPE_WEBHOOK_SECRET")]
→ whsec_... (value passed to handler, never logged)
```

The agent accumulates knowledge across sessions. Next time you work on Stripe code, it already knows the project's patterns.

---

## Auto-learn system prompt

For maximum benefit, add this to your Claude Code system prompt (`.claude/CLAUDE.md`):

```markdown
## Memory guidelines

Before working on any task:
1. Query vault.memory.query with keywords relevant to the task
2. Apply what you find — don't ask about things you already know

During the session:
- When you discover a project-specific fact or pattern, store it immediately
- When you fix a bug, store the error + fix as type 'error'
- When you confirm a procedure works, update its confidence to 0.95+
- Use specific keys: {domain}-{topic} (e.g. stripe-webhook, db-migration, deploy-checklist)

After completing a significant task:
- Store a summary under {task-name}-completed with type 'fact'
```

---

## Troubleshooting

**"Tool not found" or "No MCP tools"**

```bash
# Verify agentvault is in PATH
which agentvault

# If using full path in config:
which agentvault  # copy this path to "command" in config
```

**"Decryption failed" or "Passphrase incorrect"**

The passphrase in your MCP config must match the one used when `agentvault init` was run. Test it:

```bash
AGENTVAULT_PASSPHRASE=the-passphrase-in-your-config agentvault status
```

**"Cannot find .agentvault directory"**

The MCP server starts in the directory where the editor runs — not necessarily your project. Set `cwd` in your MCP config to point to the project containing `.agentvault/`:

```json
{
  "command": "agentvault",
  "args": ["mcp", "start"],
  "cwd": "/Users/you/projects/my-project"
}
```

**MCP server crashes silently**

Check for stale lock files:
```bash
ls /your/project/.agentvault/*.lock
rm /your/project/.agentvault/*.lock
```
