# Memory Marketplace

The memory marketplace lets you package your agent's knowledge into a sellable bank, publish it to a gateway, and earn from other agents purchasing it.

---

## Overview

```
Producer                    Gateway                     Buyer
────────                    ───────                     ─────
memory store ×100           publish (receives bank)     discover
memory package ──────────>  list/serve                  checkout ──> memory query
wallet sign                 verify signature             (bank auto-searched)
```

---

## Producing a memory bank

### 1. Accumulate knowledge

First, build up quality memories. The more specific and well-tagged, the better your bank's search relevance:

```bash
agentvault memory store stripe-webhook-sig \
  "Always verify webhook signatures with raw body. Header: Stripe-Signature. Secret: endpoint secret, not API key." \
  --type knowledge \
  --tags stripe webhook security \
  --confidence 0.99

agentvault memory store stripe-idempotency \
  "Use idempotency keys for all POST requests. Format: 'req-{uuid4}'. TTL: 24h." \
  --type knowledge \
  --tags stripe api idempotency \
  --confidence 0.95

agentvault memory store stripe-retry-logic \
  "Retry on 429 and 5xx only. Use exponential backoff: 1s, 2s, 4s, 8s, max 3 retries." \
  --type procedure \
  --tags stripe api retry error-handling \
  --confidence 0.95
```

### 2. Package the bank

```bash
agentvault memory package \
  --name "stripe-integration-kb" \
  --description "Best practices for Stripe API integration" \
  --tags stripe payments api \
  --price 0.005 \
  --license per-use
```

Options:
- `--name`: Bank identifier (used in discovery and checkout)
- `--description`: Human-readable description (shown in `discover` results)
- `--tags`: Search tags for discovery
- `--price`: Price per access in ETH (or platform token)
- `--license`: License model — see below
- `--since <date>`: Only include memories added since this date

### 3. License models

| License | Description |
|---------|-------------|
| `per-use` | Charged each time the bank is queried |
| `subscription` | Flat monthly fee for unlimited access |
| `one-time` | Pay once, use forever |
| `free` | No charge, unlimited access |
| `trial` | N free uses, then per-use |

### 4. Create a wallet

You need a signing wallet to prove ownership of your published banks:

```bash
agentvault wallet create
# Created wallet. Public key: 0x04abc123...
# Stored in .agentvault/wallet.json (encrypted)

agentvault wallet show
# Address:    0xabc123def456...
# Public key: 0x04abc123...
```

### 5. Publish to a gateway

```bash
agentvault publish \
  --bank stripe-integration-kb \
  --gateway https://av-gateway.example.com
```

The gateway receives the encrypted bank + metadata. Your wallet signature proves you're the publisher. The bank is stored server-side and listed in the gateway's catalog.

---

## Running a gateway

You can run your own gateway for private or commercial use:

```bash
agentvault gateway start --port 3000
# Gateway started at http://localhost:3000
# Routes: GET /health, GET /banks, GET /discover, POST /checkout
```

For production:
- Put it behind nginx with TLS
- Set `GATEWAY_SECRET` env var for admin operations
- Configure `STORAGE_PATH` for where banks are stored

---

## Buying a memory bank

### 1. Discover available banks

```bash
agentvault discover --gateway https://av-gateway.example.com
# stripe-integration-kb   0.005 ETH/use   "Best practices for Stripe API"
# postgres-patterns-kb    0.003 ETH/use   "PostgreSQL query patterns"
# react-architecture-kb   0.010 ETH/mo    "React component architecture"
```

Filter by topic:

```bash
agentvault discover --gateway https://av-gateway.example.com --query "stripe"
```

### 2. Purchase a bank

```bash
agentvault checkout \
  --bank stripe-integration-kb \
  --gateway https://av-gateway.example.com
```

This:
1. Verifies your wallet has sufficient balance
2. Signs the checkout request with your wallet
3. Downloads the encrypted bank to `.agentvault/purchased/stripe-integration-kb/`
4. Creates a license file with your access terms

### 3. Use the bank

Once purchased, the bank is automatically included in all `memory query` results:

```bash
agentvault memory query "stripe webhook"
# [0.850] stripe-webhook-sig (knowledge) [bank:stripe-integration-kb] -- Always verify...
# [0.800] my-local-note (knowledge) -- ...
# 2 result(s) from 47 local entries + 1 from banks
```

To search only local memories:

```bash
agentvault memory query "stripe webhook" --local-only
```

### 4. Check license status

```bash
agentvault status
# Purchased banks:
#   stripe-integration-kb  per-use  48 accesses remaining
```

---

## MCP + marketplace

When using the MCP server, `vault.memory.query` automatically searches purchased banks. The AI agent doesn't need to know about the marketplace — it just queries and gets the best results from both local and purchased knowledge.

---

## Bank quality guidelines

High-quality banks get more purchases. Tips:

1. **Be specific** — "Stripe requires raw body for webhook signature verification" beats "use correct headers"
2. **Tag densely** — more tags = more search surface = more discovery
3. **Set appropriate confidence** — don't mark guesses as 0.99
4. **Keep content focused** — one fact per memory entry, not essays
5. **Version your knowledge** — use `--since` when repackaging to include only new learnings
6. **Document your source** — use `--source "stripe-docs-2025-11"` so buyers know where it came from
