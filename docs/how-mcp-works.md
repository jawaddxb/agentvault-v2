# How AgentVault MCP Works

## Installation & Setup

When someone installs AgentVault via npm:

```bash
npm install -g agent-vault    # or npx
agentvault init               # creates .agentvault/ in their project
```

This creates a local `.agentvault/` directory with encrypted files (`vault.json`, `memory.json`, `audit.db`, etc.) — all on disk, no cloud, no network.

## The MCP Server

The MCP server is **not a daemon** — it's a **stdio process** that an AI tool (Claude Code, Claude Desktop, Cursor, etc.) spawns on demand.

```
┌─────────────────┐     stdin/stdout      ┌──────────────────┐
│  Claude Code     │ ◄──── JSON-RPC ─────► │  agentvault mcp  │
│  (or Cursor,     │                       │  start           │
│   Claude Desktop)│                       │                  │
└─────────────────┘                        └───────┬──────────┘
                                                   │
                                           reads/writes encrypted
                                           files on local disk
                                                   │
                                           ┌───────▼──────────┐
                                           │  .agentvault/    │
                                           │  ├── vault.json  │ ← secrets (AES-256-GCM)
                                           │  ├── memory.json │ ← memories (AES-256-GCM)
                                           │  └── audit.db    │ ← access log (SQLite)
                                           └──────────────────┘
```

## How an AI Tool Connects

The user adds a config entry (e.g., `.mcp.json` for Claude Code):

```json
{
  "mcpServers": {
    "agentvault": {
      "command": "agentvault",
      "args": ["mcp", "start"],
      "env": { "AGENTVAULT_PASSPHRASE": "their-passphrase" }
    }
  }
}
```

When Claude Code starts, it:
1. **Spawns** `agentvault mcp start` as a child process
2. **Handshakes** via JSON-RPC over stdin/stdout (MCP protocol)
3. **Discovers** the 11 tools (`vault.memory.store`, `vault.memory.query`, `vault.secret.get`, etc.)
4. **Calls** those tools during conversation — the AI model decides when to use them

## What Happens on a Memory Call

When Claude decides to store a memory:

```
Claude → JSON-RPC: { method: "tools/call", params: { name: "vault.memory.store", arguments: { key: "api-pattern", content: "Always use retry with exponential backoff", memoryType: "knowledge" }}}

                    ↓ agentvault process:
                    1. Rate-limit check (60 calls/min)
                    2. Decrypt memory.json using passphrase
                    3. Add entry with auto-extracted keywords
                    4. Re-encrypt and write to disk
                    5. Return { success: true, data: { key: "api-pattern", keywords: 5 }}

Claude ← JSON-RPC: { result: { content: [{ type: "text", text: "{\"success\":true,...}" }]}}
```

## Key Points

- **100% local** — no cloud, no API calls, no network. Everything is encrypted files on disk.
- **Process lifecycle** — the MCP server lives only as long as the AI tool's session. When you close Claude Code, the process exits.
- **Per-project** — each project directory gets its own `.agentvault/` with separate encrypted stores.
- **The AI agent doesn't know the passphrase** — it's passed via env var to the server process. The agent only sees decrypted results through the MCP tool responses.

## Supported AI Tools

| Tool | Config location |
|------|----------------|
| Claude Code | `.mcp.json` in project root |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Cursor | `~/.cursor/mcp.json` |
| Zed | `context_servers` in Zed's `settings.json` |

## 11 MCP Tools Exposed

| Tool | Description |
|------|-------------|
| `vault.secret.get` | Retrieve a secret by key |
| `vault.secret.list` | List all secret keys |
| `vault.memory.store` | Store an encrypted memory entry |
| `vault.memory.query` | Search memories by keywords |
| `vault.memory.list` | List memory metadata (no content) |
| `vault.memory.remove` | Delete a memory entry |
| `vault.audit.show` | View audit trail |
| `vault.status` | Vault health and stats |
| `vault.profile.show` | Show a permission profile |
| `vault.preview` | Preview env vars an agent would see |
| `vault.export` | Export portable vault (.avault) |

---

## What is a stdio Process?

**stdio** (standard input/output) is the simplest form of inter-process communication. Two processes talk by writing to each other's stdin/stdout streams — no sockets, no ports, no network.

### In AgentVault's case:

```
Claude Code (parent process)
    │
    ├── spawns: agentvault mcp start (child process)
    │
    ├── writes to child's stdin  →  "hey, store this memory"
    │
    └── reads from child's stdout ←  "done, here's the result"
```

It's like two programs connected by a pipe:
```bash
# Conceptually similar to:
echo '{"method":"tools/call",...}' | agentvault mcp start
```

### Why stdio instead of HTTP/WebSocket?

| | stdio | HTTP server |
|--|-------|-------------|
| **Startup** | Instant — just spawn a process | Need to bind a port, listen |
| **Security** | No network exposure at all | Port is open, needs auth |
| **Lifecycle** | Dies when parent dies | Can linger as orphan |
| **Config** | Zero — no ports, no URLs | Need to pick port, handle conflicts |
| **Firewall** | Not involved | May block connections |

### The actual data format

The messages are **JSON-RPC 2.0**, sent as newline-delimited JSON over the pipe:

```
→ stdin:  {"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"vault.memory.store","arguments":{"key":"api-tip","content":"use retries","memoryType":"knowledge"}}}

← stdout: {"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"{\"success\":true,\"data\":{\"key\":\"api-tip\",\"keywords\":2}}"}]}}
```

### The lifecycle

1. **Claude Code starts** → reads `.mcp.json` → sees `"command": "agentvault"`
2. **Spawns child process** → `agentvault mcp start` begins, waiting on stdin
3. **Handshake** → Claude Code sends `initialize` request, server responds with capabilities + tool list
4. **Conversation** → every time the AI decides to use a vault tool, Claude Code writes a JSON-RPC message to stdin, reads the response from stdout
5. **Session ends** → Claude Code sends `SIGTERM`, server flushes state and exits

The server's `stderr` is used for logging (like `"AgentVault MCP server running on stdio"`) — it doesn't interfere with the JSON-RPC protocol on stdout.

### Key insight

The MCP server is **not running in the background waiting for connections**. It's a short-lived process that exists only while the AI tool is using it — like a command-line tool that happens to keep running until the conversation ends.
