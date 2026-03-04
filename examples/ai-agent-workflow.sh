#!/usr/bin/env bash
set -e

# AI Agent Workflow Demo
# ----------------------
# Simulates how an AI coding agent (e.g., Claude Code) uses AgentVault
# during a real session: learning, storing, querying before acting, updating.
#
# In production, set AGENTVAULT_PASSPHRASE from a secret manager:
#   export AGENTVAULT_PASSPHRASE="$(op read 'op://Personal/AgentVault/passphrase')"

export AGENTVAULT_PASSPHRASE="demo-passphrase-change-me"

DEMO_DIR=$(mktemp -d)
cd "$DEMO_DIR"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║   AI Agent Workflow Demo                             ║"
echo "║   Simulating a Claude Code coding session            ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

agentvault init 2>/dev/null

# ─── Phase 1: Agent starts a session ─────────────────────────────────────────
echo "═══ PHASE 1: Agent starts coding session ═══"
echo ""
echo "Agent queries vault before touching anything..."

# Agent always queries first to avoid repeating mistakes
RESULTS=$(agentvault memory query "project setup configuration" 2>&1)
echo "$RESULTS" | sed 's/^/  /'

# Vault is empty — agent proceeds to learn and store as it goes
echo ""
echo "Vault empty — agent will learn as it works."
echo ""

# ─── Phase 2: Agent learns and stores knowledge ───────────────────────────────
echo "═══ PHASE 2: Agent discovers and stores knowledge ═══"
echo ""

echo "  → Discovered: project uses TypeScript strict mode"
agentvault memory store project-ts-config \
  "TypeScript strict mode enabled. All files require explicit return types. No 'any' allowed. tsconfig extends @company/tsconfig-base." \
  --type fact \
  --tags typescript project-config compiler \
  --confidence 0.99
echo ""

echo "  → Learned: API auth pattern"
agentvault memory store api-auth-pattern \
  "API uses Bearer token auth. Token format: 'Bearer eyJ...' in Authorization header. Tokens expire in 1 hour. Refresh endpoint: POST /auth/refresh." \
  --type knowledge \
  --tags api auth bearer jwt security \
  --confidence 0.95
echo ""

echo "  → Learned: database migration process"
agentvault memory store db-migration-process \
  "Run migrations with: pnpm prisma migrate deploy. Always in a transaction. Dev: migrate dev creates + applies. Never run migrate reset in production." \
  --type procedure \
  --tags database prisma migration postgres deployment \
  --confidence 0.98
echo ""

echo "  → Observed: test environment behavior"
agentvault memory store test-env-behavior \
  "Test DB is seeded fresh for each test suite via jest globalSetup. Tests that write data must use unique IDs to avoid flakiness from parallel runs." \
  --type observation \
  --tags testing jest database parallel \
  --confidence 0.85
echo ""

echo "  → Discovered: deployment target"
agentvault memory store deployment-target \
  "Production runs on Railway.app. Project: hafiz-production. Deploy: git push main triggers CI. Env vars managed via Railway dashboard, not .env files." \
  --type knowledge \
  --tags deployment railway production ci-cd \
  --confidence 0.99
echo ""

echo "  → Remembered: common error fix"
agentvault memory store prisma-connection-error \
  "PrismaClientInitializationError: check DATABASE_URL format. Must include ?schema=public for Railway Postgres. Pool size: ?connection_limit=5 for serverless." \
  --type error \
  --tags prisma postgres error railway \
  --confidence 0.92
echo ""

# ─── Phase 3: Agent queries before making decisions ──────────────────────────
echo "═══ PHASE 3: Agent queries before acting ═══"
echo ""

echo "  About to modify API auth — querying first..."
agentvault memory query "API authentication bearer token" --limit 3 | sed 's/^/    /'
echo ""

echo "  About to run database migration — querying first..."
agentvault memory query "database migration" --limit 3 | sed 's/^/    /'
echo ""

echo "  About to deploy — querying checklist..."
agentvault memory query "deployment production railway" --limit 3 | sed 's/^/    /'
echo ""

# ─── Phase 4: Duplicate key update with overwrite ────────────────────────────
echo "═══ PHASE 4: Updating knowledge (overwrite demo) ═══"
echo ""

echo "  Agent learned more about auth — updating the entry..."
echo "  Without --overwrite (shows warning):"
agentvault memory store api-auth-pattern \
  "API uses Bearer token auth. Token format: 'Bearer eyJ...' in Authorization header. Tokens expire in 1 hour (configurable via TOKEN_TTL env var). Refresh: POST /auth/refresh. Revoke: DELETE /auth/sessions/{id}." \
  --type knowledge \
  --tags api auth bearer jwt security 2>&1 | sed 's/^/    /'
echo ""

echo "  With --overwrite (suppresses warning):"
agentvault memory store api-auth-pattern \
  "API uses Bearer token auth. Token format: 'Bearer eyJ...' in Authorization header. Tokens expire in 1 hour (configurable via TOKEN_TTL env var). Refresh: POST /auth/refresh. Revoke: DELETE /auth/sessions/{id}." \
  --type knowledge \
  --tags api auth bearer jwt security \
  --overwrite 2>&1 | sed 's/^/    /'
echo ""

# ─── Phase 5: Export memories ────────────────────────────────────────────────
echo "═══ PHASE 5: Export session knowledge ═══"
echo ""

EXPORT_FILE="$DEMO_DIR/session-knowledge.json"
agentvault memory export -o "$EXPORT_FILE"
echo "  Exported to: $EXPORT_FILE"
ENTRY_COUNT=$(python3 -c "import json; d=json.load(open('$EXPORT_FILE')); print(len(d))")
echo "  Entries: $ENTRY_COUNT"
echo ""

# ─── Phase 6: Sandboxed execution ────────────────────────────────────────────
echo "═══ PHASE 6: Sandboxed agent execution ═══"
echo ""

# Add a secret first
agentvault secret add OPENAI_KEY "sk-demo-abc123def456ghi789jkl012mno345pqr678stu"
agentvault secret add DATABASE_URL "postgres://app:secret@db.railway.app:5432/hafiz?schema=public"

echo "  Running node with 'moderate' profile (secrets injected securely):"
agentvault wrap --profile moderate -- node --version | sed 's/^/    /'
echo ""

echo "  What the agent sees with 'restrictive' profile:"
agentvault preview --profile restrictive | sed 's/^/    /'
echo ""

# ─── Done ────────────────────────────────────────────────────────────────────
echo "╔══════════════════════════════════════════════════════╗"
echo "║  Agent workflow complete!                            ║"
echo "║                                                      ║"
echo "║  Knowledge accumulated:                              ║"
agentvault memory list 2>/dev/null | grep "entries total" | sed 's/^/║    /'
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Cleanup
cd /
rm -rf "$DEMO_DIR"
