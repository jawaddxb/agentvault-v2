# Testing Encrypted Memory with Agents

## Context

AgentVault has an encrypted memory system (AES-256-GCM, keyword search, TTL) exposed via an MCP server over stdio. Currently **no test exercises the actual MCP transport** — all existing tests call functions directly. The goal is to connect a real agent to the MCP server and exercise store/query/list/remove on encrypted memory.

We build incrementally: start with the simplest approach (Claude Code as the agent), then add automated and autonomous testing.

---

## Phase 1: Bootstrap + Claude Code MCP Integration (start here)

### Step 1 — Install dependencies
```bash
npm install
```

### Step 2 — Initialize the vault
```bash
AGENTVAULT_PASSPHRASE=test-passphrase npx tsx src/index.ts init --skip-passphrase
```
Creates `.agentvault/` directory in the project root (already gitignored).

### Step 3 — Create `.mcp.json`

**File:** `.mcp.json` (project root)

```json
{
  "mcpServers": {
    "agentvault": {
      "command": "node_modules/.bin/tsx",
      "args": ["src/index.ts", "mcp", "start"],
      "env": {
        "AGENTVAULT_PASSPHRASE": "test-passphrase"
      }
    }
  }
}
```

This gives Claude Code live access to all 11 vault tools. After restarting Claude Code, you can immediately:
- Store memories: `vault.memory.store`
- Query memories: `vault.memory.query`
- List memories: `vault.memory.list`
- Remove memories: `vault.memory.remove`

### Step 4 — Add `.mcp.json` to `.gitignore`
Append `.mcp.json` to `.gitignore` (contains passphrase).

---

## Phase 2: Programmatic MCP Client Test (automated, CI-ready)

### File to create
`tests/integration/mcp-memory-agent.test.ts`

### What it does
Spawns the real MCP server as a child process, connects via `StdioClientTransport` from `@modelcontextprotocol/sdk/client/stdio.js`, and runs deterministic test scenarios through the JSON-RPC protocol.

### Test scenarios
1. **Tools discovery** — `listTools()` returns all 11 tools with correct schemas
2. **Store + query roundtrip** — store 3 entries with different memoryTypes/tags/confidence, query by keywords, verify score ordering
3. **List with filters** — filter by tag, filter by memoryType
4. **Key overwrite** — store same key with new content, verify old keywords gone and new keywords searchable
5. **Remove + KEY_NOT_FOUND** — remove an entry, try removing again → expect `KEY_NOT_FOUND` error code
6. **TTL expiry** — store with `ttlSeconds: 1`, wait 1.1s, verify excluded from query results
7. **No partial matching** — "web" must NOT match "webhook"
8. **System-prompt resource** — `readResource('agentvault://system-prompt')` returns instructions containing `vault.memory.query` and `vault.memory.store`
9. **Error handling** — invalid input returns proper error codes

### Key implementation details
- Uses `@modelcontextprotocol/sdk` Client (already a dependency)
- Spawns server with a temp dir as cwd (each test run gets a fresh encrypted vault)
- Passphrase set via `env` on the transport
- Timeout: 60s (transport startup + scenarios)
- Helper: `callTool<T>(name, args) → McpResponse<T>` parses JSON from MCP content blocks

### Run
```bash
npx vitest run tests/integration/mcp-memory-agent.test.ts
```

---

## Phase 3: Autonomous Claude Agent Script (full AI loop)

### File to create
`tests/agents/memory-validation-agent.ts`

### New dev dependency
```bash
npm install --save-dev @anthropic-ai/sdk
```

### What it does
A standalone script (not vitest) that:
1. Spawns the MCP server via `StdioClientTransport`
2. Reads `agentvault://system-prompt` resource
3. Runs a 2-turn conversation with Claude (haiku for speed/cost):
   - **Turn 1:** Asks "How do I verify Stripe webhooks in Node.js?" → model should call `vault.memory.query` (finds nothing), answer, then call `vault.memory.store`
   - **Turn 2:** Asks the same topic again → model should call `vault.memory.query` and find the stored entry
4. Prints full transcript showing each tool call and result
5. Validates the agent followed the memory instructions

### Run
```bash
ANTHROPIC_API_KEY=sk-ant-... AGENTVAULT_PASSPHRASE=test-passphrase npx tsx tests/agents/memory-validation-agent.ts
```

### Limitations
- Requires `ANTHROPIC_API_KEY`
- Non-deterministic (LLM output)
- Not suitable for CI — manual validation only
- ~$0.01-0.05 per run with haiku

---

## Verification

### Phase 1
After restarting Claude Code, the `agentvault` MCP server appears in connected servers. Running `vault.memory.store` and `vault.memory.query` through Claude Code works interactively.

### Phase 2
```bash
npx vitest run tests/integration/mcp-memory-agent.test.ts
```
All 9 test scenarios pass.

### Phase 3
```bash
ANTHROPIC_API_KEY=... AGENTVAULT_PASSPHRASE=test-passphrase npx tsx tests/agents/memory-validation-agent.ts
```
Transcript shows the agent querying memory before answering and storing after.

---

## Files summary

| File | Action | Phase |
|------|--------|-------|
| `.mcp.json` | Create | 1 |
| `.gitignore` | Append `.mcp.json` | 1 |
| `tests/integration/mcp-memory-agent.test.ts` | Create | 2 |
| `vitest.config.ts` | May update timeout | 2 |
| `tests/agents/memory-validation-agent.ts` | Create | 3 |
| `package.json` | Add `@anthropic-ai/sdk` devDep | 3 |
