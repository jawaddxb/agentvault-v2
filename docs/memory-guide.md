# Memory Guide

AgentVault's memory system is designed for AI agents that need to accumulate knowledge across sessions — facts they've learned, patterns they've observed, procedures they've confirmed work. Everything is encrypted at rest and searchable by keyword.

---

## Memory types

Choose the type that best describes what you're storing. The type is searchable and helps with filtering.

| Type | When to use |
|------|-------------|
| `knowledge` | **Default.** General facts, best practices, API behaviors. "Stripe requires raw body for webhook signature verification." |
| `fact` | Verified facts with high confidence. "The production DB is PostgreSQL 15.3." |
| `observation` | Things you noticed during a session, not yet verified. "API started returning 429s at 14:23." |
| `preference` | User or system preferences. "User prefers TypeScript strict mode." |
| `procedure` | Step-by-step processes. "Deploy sequence: test → build → migrate → deploy → smoke test." |
| `code` | Code snippets or patterns. "Idempotent upsert pattern for this schema." |
| `error` | Known errors and their fixes. "ENOMEM on VM = swap exhausted, restart with 2GB swap." |
| `query_cache` | Cached query results (use with `--ttl`). Set TTL to expire when data goes stale. |
| `operational` | Runtime state. Usually short-lived (use `--ttl`). |

---

## Tagging

Tags are indexed as keywords, making them searchable. Tag consistently.

**Good tags:** `stripe`, `webhook`, `api-v2`, `production`, `deployment`, `postgres`, `redis`

**Bad tags:** `important`, `todo`, `misc` — too generic, pollutes search results

```bash
# Tagging strategies
agentvault memory store stripe-idempotency \
  "Use idempotency keys for all Stripe API calls. Format: 'req-{uuid4}'" \
  --tags stripe api idempotency production

# Comma-separated works too (v2.0.1+)
agentvault memory store stripe-idempotency \
  "Use idempotency keys for all Stripe API calls. Format: 'req-{uuid4}'" \
  --tags "stripe,api,idempotency,production"
```

Tag rules:
- Alphanumeric, hyphens, and dots only: `[a-z0-9\-\.]+`
- Max 64 characters per tag
- Max 50 tags per entry
- Commas are NOT valid in a tag — use the CLI's comma-split feature or space-separate

---

## Search algorithm

When you query, every entry in the vault is scored and ranked. Understanding the scoring helps you write better content and tags.

### Score formula

```
score = matchRatio × confidence × freshnessDecay × recencyBoost
```

### matchRatio

The fraction of your query tokens that appear in the entry's keyword set.

```
query: "stripe webhook verification"  → tokens: [stripe, webhook, verification]
entry keywords: [stripe, webhook, api, signature, raw, body]

matched: [stripe, webhook] → 2 out of 3 query tokens
matchRatio = 2/3 = 0.667
```

**Implication:** Be specific in queries. "stripe webhook" will score higher for webhook entries than a generic "api" query.

### confidence

The stored confidence score (0.0–1.0). Default is 0.8. Use this to weight how much to trust each entry.

```bash
# High confidence — verified, battle-tested
agentvault memory store deploy-runbook \
  "Always run migrations before deploying" \
  --confidence 0.99

# Lower confidence — needs verification
agentvault memory store unverified-rate-limit \
  "Rate limit might be 100 req/min" \
  --confidence 0.4
```

### freshnessDecay

Entries without a TTL have `freshnessDecay = 1.0` (no penalty). Entries with TTL decay linearly as they approach expiry.

A memory that's 90% through its TTL gets a 0.1× score — it's about to expire because it's probably stale. This keeps search results fresh without manual cleanup.

### recencyBoost

Frequently accessed entries get a small boost (up to +10%). Entries accessed 10+ times get the full boost.

```
boost = 1.0 + min(accessCount, 10) × 0.01
```

The boost is small by design — it shouldn't override relevance, just act as a tiebreaker between equally-matching entries.

---

## TTL and expiry

Use TTL for anything that might go stale:

```bash
# Cache an API response for 5 minutes
agentvault memory store current-user-plan \
  "User 12345 is on Pro plan, $49/mo" \
  --type query_cache \
  --ttl 300

# Mark an incident as active for 4 hours
agentvault memory store incident-2025-03-15 \
  "Production DB is running at 95% capacity, migration in progress" \
  --type operational \
  --ttl 14400

# Temporary auth token (1 hour)
agentvault memory store temp-session-token \
  "Session token: eyJ..." \
  --type operational \
  --ttl 3600
```

Expired entries are filtered out of query results but not deleted immediately. Run `agentvault memory list` to see them (they'll show as expired). Clean up with `agentvault memory remove`.

---

## Duplicate key behavior

If you `memory store` with a key that already exists:

```bash
$ agentvault memory store stripe-webhooks "Updated content..."
Warning: Key "stripe-webhooks" already exists. Overwriting. Use --overwrite to suppress this warning.
Memory "stripe-webhooks" stored (8 keywords)
```

To suppress the warning when you know you're intentionally updating:

```bash
agentvault memory store stripe-webhooks "Updated content..." --overwrite
Memory "stripe-webhooks" stored (8 keywords)
```

What happens on overwrite:
- Content is replaced
- Keywords are re-extracted from the new content
- `accessCount` resets to 0
- `addedAt` timestamp is updated to now

---

## Exporting

Export all memories to a decrypted JSON file:

```bash
agentvault memory export -o memories-backup.json
```

The JSON format matches the internal `MemoryEntry` schema. Useful for:
- Migrating to a new machine
- Auditing what an agent has learned
- Seeding a new vault from a known-good baseline

---

## Purchasing memory banks

Memory banks are pre-packaged knowledge collections you can buy from a gateway and use in your queries.

Purchased banks are automatically searched when you run `memory query` (unless you pass `--local-only`). Bank results appear alongside local results, labeled with their source:

```
[0.850] stripe-retry-logic (knowledge) [bank:stripe-kb] -- Use exponential backoff...
[0.800] stripe-webhooks (knowledge) -- Always verify webhook signatures...
```

See [memory-marketplace.md](./memory-marketplace.md) for the full workflow.

---

## Performance

**Benchmarked on Apple M-series, 502 entries:**

| Operation | Time |
|-----------|------|
| `memory query` | ~195ms flat |
| `memory store` | ~195ms flat |
| `memory list` | ~50ms |
| `memory export` | ~257ms |

**Why ~195ms?** That's the scrypt key derivation. Every read or write derives the encryption key from the passphrase. It's intentionally slow to resist brute-force attacks on the vault file.

**Does it degrade with entries?** Barely. At 502 entries, query time is the same as at 1 entry. The file is loaded into memory and searched in a single pass. You won't notice a difference until ~10,000 entries.

**Scale ceiling:** Around 10,000 entries, the single-file read/write architecture starts to hurt — each write rewrites the entire file. At that scale, consider using SQLite or a proper database. AgentVault v2 is designed for agent working memory (hundreds of entries), not a knowledge base (millions of entries).

---

## CJK and Arabic search

AgentVault automatically detects non-ASCII content and uses bigram extraction for languages that don't use whitespace word boundaries:

```bash
# Chinese
agentvault memory store error-handling-cn \
  "所有API调用必须处理网络超时" \
  --type knowledge

agentvault memory query "API调用"
# Will match because "API调" and "调用" are extracted as bigrams

# Arabic
agentvault memory store auth-arabic \
  "مصادقة Bearer مطلوبة لجميع طلبات API" \
  --type knowledge

agentvault memory query "Bearer مصادقة"
# Bigram + keyword matching on Arabic text
```
