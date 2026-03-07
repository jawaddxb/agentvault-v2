# Plan: Marketplace MCP Server — Skills Search & Publish

## Context
The marketplace Next.js app runs at `localhost:3001` with API endpoints for searching and publishing skills. We need a **standalone MCP server** (completely separate from the existing vault MCP at `src/mcp/server.ts`) that exposes two tools for AI agents:
1. **Search skills** — public, no API key needed
2. **Publish skills** — requires API key

## Tools

### `marketplace.search_skills`
- **Input:** `{ query: string }` — query is required
- **Auth:** None (search API is public)
- **HTTP call:** `GET {MARKETPLACE_URL}/api/search?type=skill&q={query}`
- **Returns:** Array of skill results `[{ id, name, description, tags, entryCount, author, createdAt }]`

### `marketplace.publish_skill`
- **Input:** `{ name: string, description?: string, content: string, tags?: string[], apiKey: string }`
- **Auth:** `Authorization: Bearer {apiKey}` header
- **HTTP call:** `POST {MARKETPLACE_URL}/api/datasets` with `category: "skills"` hardcoded in body
- **Returns:** `{ id, name }` on success

## Files to Create/Modify

| # | File | Action |
|---|------|--------|
| 1 | `marketplace/package.json` | Add deps: `@modelcontextprotocol/sdk`, `zod`, `tsx`. Add script: `"mcp": "tsx src/mcp/server.ts"` |
| 2 | `marketplace/src/mcp/server.ts` | New file (~80 LOC) — standalone MCP server |

## Implementation: `marketplace/src/mcp/server.ts`

- Uses `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js` (high-level API with zod schemas)
- Uses `StdioServerTransport` for stdio transport
- Base URL from env `MARKETPLACE_URL` (default `http://localhost:3001`)
- Two `server.tool()` registrations with zod input schemas
- Errors: catches fetch failures and non-ok responses, returns error as text content

## Verification
1. `cd marketplace && pnpm install`
2. Start marketplace in one terminal: `pnpm dev`
3. Test MCP server lists tools: `echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | npx tsx src/mcp/server.ts`
4. After restart, use `marketplace.search_skills` and `marketplace.publish_skill` via Claude Code MCP tools
