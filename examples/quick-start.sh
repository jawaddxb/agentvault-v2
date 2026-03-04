#!/usr/bin/env bash
set -e

# AgentVault Quick Start
# ----------------------
# This script demonstrates the core AgentVault workflow.
# In production, set AGENTVAULT_PASSPHRASE from a secret manager.
# NEVER hardcode a real passphrase in a script.

# ⚠️  Demo passphrase — replace with a strong passphrase in production
export AGENTVAULT_PASSPHRASE="demo-passphrase-change-me"

DEMO_DIR=$(mktemp -d)
cd "$DEMO_DIR"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║     AgentVault Quick Start Demo          ║"
echo "╚══════════════════════════════════════════╝"
echo "Working in: $DEMO_DIR"
echo ""

# ─── 1. Initialize ───────────────────────────────────────────────────────────
echo "▶ Step 1: Initialize vault"
agentvault init
echo "  ✓ .agentvault/ created"
echo ""

# ─── 2. Add secrets ──────────────────────────────────────────────────────────
echo "▶ Step 2: Add secrets"
agentvault secret add OPENAI_KEY "sk-demo-abc123def456ghi789jkl012mno345pqr678stu"
agentvault secret add STRIPE_KEY "sk_live_demo_51NxQyZ2eZvKYlo2CxKdemo123456789"
agentvault secret add GITHUB_TOKEN "ghp_demo16CharPad1234567890abcdefghijklmnop"
echo "  ✓ Added OPENAI_KEY, STRIPE_KEY, GITHUB_TOKEN"
echo ""

echo "  Listing secrets (keys only, never values):"
agentvault secret list | sed 's/^/    /'
echo ""

# ─── 3. Store memories ───────────────────────────────────────────────────────
echo "▶ Step 3: Store agent memories"

agentvault memory store stripe-webhook-policy \
  "Always verify Stripe webhook signatures using raw request body, not parsed JSON. Header: Stripe-Signature. Secret: webhook endpoint secret (not API key)." \
  --type knowledge \
  --tags stripe webhook security api \
  --confidence 0.99

agentvault memory store openai-retry-policy \
  "Retry OpenAI API calls on 429 and 503 only. Use exponential backoff: 1s, 2s, 4s. Max 3 retries. Log the request_id from response headers." \
  --type procedure \
  --tags openai api retry error-handling \
  --confidence 0.95

agentvault memory store project-tech-stack \
  "This project uses Next.js 15 (app router), TypeScript strict mode, Tailwind CSS v4, Prisma ORM with PostgreSQL 16." \
  --type fact \
  --tags project nextjs typescript prisma postgres \
  --confidence 1.0

agentvault memory store deploy-checklist \
  "Pre-deploy: (1) run tests (2) run migrations (3) check feature flags (4) notify #deployments in Slack. Post-deploy: smoke test /health and /api/status." \
  --type procedure \
  --tags deployment checklist production \
  --confidence 0.98

echo "  ✓ Stored 4 memories"
echo ""

# ─── 4. Query memories ───────────────────────────────────────────────────────
echo "▶ Step 4: Query memories"

echo "  Query: 'stripe webhook'"
agentvault memory query "stripe webhook" | sed 's/^/    /'
echo ""

echo "  Query: 'deployment checklist production'"
agentvault memory query "deployment checklist production" --limit 3 | sed 's/^/    /'
echo ""

# ─── 5. List with limit ──────────────────────────────────────────────────────
echo "▶ Step 5: List memories (paginated)"

echo "  All memories:"
agentvault memory list | sed 's/^/    /'
echo ""

echo "  First 2 only:"
agentvault memory list -n 2 | sed 's/^/    /'
echo ""

# ─── 6. Health check ─────────────────────────────────────────────────────────
echo "▶ Step 6: Vault health check"
agentvault doctor | sed 's/^/  /'
echo ""

# ─── 7. Status ───────────────────────────────────────────────────────────────
echo "▶ Step 7: Vault status"
agentvault status | sed 's/^/  /'
echo ""

# ─── Done ────────────────────────────────────────────────────────────────────
echo "╔══════════════════════════════════════════╗"
echo "║  Quick start complete!                   ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo "  agentvault wrap -p moderate -- your-agent-command"
echo "  agentvault mcp start    # for MCP-compatible editors"
echo "  agentvault audit show   # see access log"
echo ""

# Cleanup
cd /
rm -rf "$DEMO_DIR"
