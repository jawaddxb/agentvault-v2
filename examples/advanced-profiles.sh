#!/usr/bin/env bash
set -e

# Advanced Profiles Demo
# ----------------------
# Demonstrates permission profiles: built-in profiles, custom profiles,
# preview, diff, and sandboxed execution.
#
# In production, set AGENTVAULT_PASSPHRASE from a secret manager.

export AGENTVAULT_PASSPHRASE="demo-passphrase-change-me"

DEMO_DIR=$(mktemp -d)
cd "$DEMO_DIR"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║   Advanced Profiles Demo                         ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

agentvault init 2>/dev/null

# Add a realistic set of secrets
agentvault secret add OPENAI_KEY "sk-demo-abc123def456ghi789jkl012mno345pqr678stu"
agentvault secret add STRIPE_KEY "sk_live_demo_51NxQyZ2eZvKYlo2CxKdemo123456789"
agentvault secret add STRIPE_WEBHOOK_SECRET "whsec_demo_abc123def456ghi789jklmnop012345"
agentvault secret add GITHUB_TOKEN "ghp_demo16CharPad1234567890abcdefghijklmnop"
agentvault secret add DATABASE_URL "postgres://app:secret@db.railway.app:5432/hafiz?schema=public"
agentvault secret add AWS_ACCESS_KEY_ID "AKIADEMO1234567890AB"
agentvault secret add AWS_SECRET_ACCESS_KEY "demo/abc123def456ghi789jklmnopQRSTUVWXYZ"
agentvault secret add REDIS_URL "redis://:secret@redis.railway.app:6379"
agentvault secret add SENTRY_DSN "https://demo123@o123456.ingest.sentry.io/456789"

echo "  ✓ Added 9 secrets (OpenAI, Stripe, GitHub, DB, AWS, Redis, Sentry)"
echo ""

# ─── Step 1: View built-in profiles ─────────────────────────────────────────
echo "═══ STEP 1: Built-in profiles ═══"
echo ""

echo "  Available profiles:"
agentvault profile list | sed 's/^/    /'
echo ""

echo "  'restrictive' profile — denies everything except system vars:"
agentvault profile show restrictive | sed 's/^/    /'
echo ""

echo "  'moderate' profile — allows common dev vars, redacts secrets:"
agentvault profile show moderate | sed 's/^/    /'
echo ""

# ─── Step 2: Preview built-in profiles ──────────────────────────────────────
echo "═══ STEP 2: Preview what each agent sees ═══"
echo ""

echo "  'restrictive' preview (untrusted agent):"
agentvault preview --profile restrictive | sed 's/^/    /'
echo ""

echo "  'moderate' preview (trusted dev agent):"
agentvault preview --profile moderate | sed 's/^/    /'
echo ""

# ─── Step 3: Create a custom profile ────────────────────────────────────────
echo "═══ STEP 3: Create 'stripe-agent' custom profile ═══"
echo ""

# Create profile JSON directly (in practice, use `agentvault profile create`)
mkdir -p .agentvault/profiles
cat > .agentvault/profiles/stripe-agent.json << 'EOF'
{
  "name": "stripe-agent",
  "description": "Agent for Stripe webhook processing — only gets Stripe credentials",
  "allow": [
    "STRIPE_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "NODE_ENV",
    "PATH",
    "HOME"
  ],
  "deny": [
    "AWS_*",
    "GITHUB_*",
    "DATABASE_URL",
    "REDIS_URL"
  ],
  "redact": [
    "STRIPE_KEY"
  ]
}
EOF

echo "  ✓ Created stripe-agent profile"
echo ""

echo "  'stripe-agent' profile:"
agentvault profile show stripe-agent | sed 's/^/    /'
echo ""

echo "  'stripe-agent' preview — what the webhook handler would see:"
agentvault preview --profile stripe-agent | sed 's/^/    /'
echo ""

# ─── Step 4: Diff two profiles ──────────────────────────────────────────────
echo "═══ STEP 4: Diff profiles ═══"
echo ""

echo "  Comparing 'moderate' vs 'permissive':"
agentvault diff moderate permissive | sed 's/^/    /'
echo ""

echo "  Comparing 'stripe-agent' vs 'moderate':"
agentvault diff stripe-agent moderate | sed 's/^/    /'
echo ""

# ─── Step 5: Wrap commands with profiles ────────────────────────────────────
echo "═══ STEP 5: Wrapped execution ═══"
echo ""

echo "  Running with 'stripe-agent' profile:"
echo "  (Only STRIPE_KEY, STRIPE_WEBHOOK_SECRET, NODE_ENV are in env)"
agentvault wrap --profile stripe-agent -- env | grep -E "^(STRIPE|NODE_ENV)" | sort | sed 's/^/    /' || true
echo ""

echo "  Running with 'restrictive' profile:"
echo "  (No secrets, only system vars)"
agentvault wrap --profile restrictive -- env | grep -v "^_" | wc -l | xargs -I{} echo "    {} env vars visible"
echo ""

echo "  Running with 'permissive' profile:"
echo "  (All secrets visible — use only with fully trusted agents)"
agentvault wrap --profile permissive -- env | grep -E "^(STRIPE|OPENAI|GITHUB)" | sort | sed 's/^/    /' || true
echo ""

# ─── Step 6: Audit trail ─────────────────────────────────────────────────────
echo "═══ STEP 6: Audit trail ═══"
echo ""
echo "  Recent access log:"
agentvault audit show | sed 's/^/    /'
echo ""

# ─── Done ────────────────────────────────────────────────────────────────────
echo "╔══════════════════════════════════════════════════╗"
echo "║  Profiles demo complete!                         ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "Key takeaways:"
echo "  • restrictive: safe default for untrusted/external agents"
echo "  • moderate: balanced for dev agents (redacts sensitive keys)"
echo "  • permissive: full access, use only for fully trusted agents"
echo "  • Custom profiles: fine-grained per-agent access control"
echo ""

# Cleanup
cd /
rm -rf "$DEMO_DIR"
