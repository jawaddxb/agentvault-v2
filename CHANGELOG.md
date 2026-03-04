# Changelog

## v2.0.0 (2026-03-04) — Gateway
- Wallet management (create, show, sign)
- Hono gateway server with /health, /banks, /discover, /checkout
- publish/discover/checkout CLI commands
- Signature-based buyer authentication
- Content hash verification on checkout
- Security: export passphrase isolation, path traversal prevention

## v1.2.0 — Producer
- Knowledge bank packaging with --since filter
- Bank descriptors with content hash
- License enforcement (5 access models)
- Purchased bank search in MCP queries

## v1.1.0 — Agent
- Enhanced MCP auto-learn prompt
- Budget and rate limit flags
- GitHub Actions CI
- Budget inheritance on crash recovery

## v1.0.0 — Vault
- AES-256-GCM encrypted credential vault
- Memory store with keyword search
- MCP server (11 tools, stdio transport)
- Permission profiles (restrictive/moderate/permissive)
- Sandboxed agent execution
- Audit logging (SQLite)
- Input validation, file locking, proper file permissions
