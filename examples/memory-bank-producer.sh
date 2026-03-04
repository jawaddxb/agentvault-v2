#!/usr/bin/env bash
set -e

# Memory Bank Producer Demo
# -------------------------
# Demonstrates how to accumulate knowledge, package it into a memory bank,
# and prepare it for publishing on the marketplace.
#
# In production, set AGENTVAULT_PASSPHRASE from a secret manager.

export AGENTVAULT_PASSPHRASE="demo-passphrase-change-me"

DEMO_DIR=$(mktemp -d)
cd "$DEMO_DIR"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║   Memory Bank Producer Demo                             ║"
echo "║   Building a 'stripe-integration' knowledge bank        ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

agentvault init 2>/dev/null
agentvault wallet create 2>/dev/null || true

# ─── Phase 1: Build up knowledge ─────────────────────────────────────────────
echo "═══ PHASE 1: Accumulating knowledge ═══"
echo ""

echo "  Storing Stripe integration best practices..."

agentvault memory store stripe-webhook-signature \
  "Always verify webhook signatures with the raw request body, not parsed JSON. Use stripe.webhooks.constructEvent(rawBody, sigHeader, endpointSecret). The Stripe-Signature header contains timestamp + HMAC signatures." \
  --type knowledge \
  --tags stripe webhook security signature verification \
  --confidence 0.99

agentvault memory store stripe-idempotency \
  "Use idempotency keys for all Stripe POST requests. Format: 'req-{uuid4}'. Pass as Idempotency-Key header. Keys expire after 24 hours. Critical for charge creation, subscription updates." \
  --type knowledge \
  --tags stripe api idempotency reliability \
  --confidence 0.99

agentvault memory store stripe-retry-policy \
  "Retry on 429 (rate limit) and 5xx only. Use exponential backoff: 1s, 2s, 4s, 8s. Max 3 retries. Never retry on 4xx (except 429). Log stripe request_id from response header for debugging." \
  --type procedure \
  --tags stripe api retry error-handling resilience \
  --confidence 0.95

agentvault memory store stripe-error-codes \
  "card_declined: show user-friendly message, never expose raw code. insufficient_funds: suggest different card. authentication_required: trigger 3DS flow. incorrect_cvc: allow retry. expired_card: prompt update." \
  --type knowledge \
  --tags stripe errors payment-ui ux \
  --confidence 0.97

agentvault memory store stripe-customer-creation \
  "Create Stripe customer on user signup, store stripe_customer_id in your DB. Never create multiple customers for the same user. Use metadata to link to your user ID: {user_id: '123'}." \
  --type procedure \
  --tags stripe customer database idempotency \
  --confidence 0.98

agentvault memory store stripe-subscription-lifecycle \
  "Listen to these webhook events: customer.subscription.created, updated, deleted, customer.subscription.trial_will_end (3 days before). Update your DB on each event. Treat webhook events as source of truth, not API responses." \
  --type knowledge \
  --tags stripe subscription webhook events saas \
  --confidence 0.99

agentvault memory store stripe-test-cards \
  "Test card numbers: 4242424242424242 (success), 4000000000000002 (declined), 4000002500003155 (3DS required), 4000000000009995 (insufficient funds). Use any future expiry, any 3-digit CVV." \
  --type knowledge \
  --tags stripe testing cards development \
  --confidence 1.0

agentvault memory store stripe-metadata-limits \
  "Stripe metadata: max 50 keys, max 500 chars per value, max 40 chars per key. Keys must be strings. No nested objects — flatten with underscores: user_plan_name, not user.plan.name." \
  --type fact \
  --tags stripe metadata limits api \
  --confidence 1.0

agentvault memory store stripe-price-vs-product \
  "Product = what you sell (name, description). Price = how you charge (amount, currency, recurring interval). One product can have many prices (monthly + annual + lifetime). Always archive old prices, never delete." \
  --type knowledge \
  --tags stripe billing product price architecture \
  --confidence 0.99

agentvault memory store stripe-portal-setup \
  "Enable Stripe Customer Portal in Dashboard for self-serve billing management. Configure allowed actions (cancel, update payment method, update plan). Redirect URL must match your domain. Generate session server-side only." \
  --type procedure \
  --tags stripe portal billing self-serve \
  --confidence 0.95

agentvault memory store stripe-invoice-finalization \
  "Invoice is finalized → payment attempted automatically if default payment method set. Listen to invoice.payment_failed for dunning. invoice.payment_succeeded → provision access. Void invoices never attempt payment." \
  --type knowledge \
  --tags stripe invoices billing payment dunning \
  --confidence 0.97

agentvault memory store stripe-webhook-replay \
  "Stripe retries webhooks up to 72 hours on failure (with exponential backoff). Your endpoint must be idempotent — process the same event twice without side effects. Use event.id as idempotency key in your DB." \
  --type knowledge \
  --tags stripe webhook reliability idempotency \
  --confidence 0.99

echo "  ✓ Stored 12 knowledge entries"
echo ""

# ─── Phase 2: Verify quality ─────────────────────────────────────────────────
echo "═══ PHASE 2: Verify search quality ═══"
echo ""

echo "  Test query: 'webhook signature verification'"
agentvault memory query "webhook signature verification" --limit 3 | sed 's/^/    /'
echo ""

echo "  Test query: 'retry failed payment'"
agentvault memory query "retry failed payment" --limit 3 | sed 's/^/    /'
echo ""

echo "  Test query: 'subscription lifecycle events'"
agentvault memory query "subscription lifecycle events" --limit 3 | sed 's/^/    /'
echo ""

# ─── Phase 3: Review all entries ─────────────────────────────────────────────
echo "═══ PHASE 3: Review bank contents ═══"
echo ""

echo "  All entries tagged 'stripe':"
agentvault memory list --tag stripe | sed 's/^/    /'
echo ""

# ─── Phase 4: Package the bank ───────────────────────────────────────────────
echo "═══ PHASE 4: Package into a memory bank ═══"
echo ""

agentvault memory package \
  --name "stripe-integration-kb" \
  --description "Production-ready Stripe integration patterns: webhooks, subscriptions, billing, error handling, test cards" \
  --price 0.005 \
  --license per-use \
  2>&1 | sed 's/^/  /'

echo ""
echo "  ✓ Bank packaged"
echo ""

# ─── Phase 5: Show bank descriptor ───────────────────────────────────────────
echo "═══ PHASE 5: Bank descriptor ═══"
echo ""

# Show what got created
if ls .agentvault/banks/ 2>/dev/null | head -5; then
  echo ""
fi

echo "  To publish this bank to a gateway:"
echo "    agentvault publish \\"
echo "      --bank stripe-integration-kb \\"
echo "      --gateway https://av-gateway.yourdomain.com"
echo ""

echo "  To run your own gateway:"
echo "    agentvault gateway start --port 3000"
echo ""

# ─── Phase 6: Wallet info ────────────────────────────────────────────────────
echo "═══ PHASE 6: Publisher wallet ═══"
echo ""
echo "  Your signing wallet:"
agentvault wallet show 2>&1 | sed 's/^/    /'
echo ""

# ─── Done ────────────────────────────────────────────────────────────────────
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  Memory bank ready for publishing!                      ║"
echo "║                                                          ║"
echo "║  Bank: stripe-integration-kb                            ║"
echo "║  Entries: 12 high-quality Stripe patterns               ║"
echo "║  License: per-use @ 0.005 ETH                           ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# Cleanup
cd /
rm -rf "$DEMO_DIR"
