# AgentVault Memory Rules

Pre-built rules to store in AgentVault's encrypted memory. Paste each command into a Claude Code session with the AgentVault MCP server connected.

---

## Understanding Confidence Values

Confidence is a number from **0.0 to 1.0** that represents how much to trust a memory when it appears in search results. It directly multiplies the search score:

```
score = matchRatio × confidence × freshness × recencyBoost
```

A memory with `confidence: 0.95` scores higher than the same memory with `confidence: 0.5` — it gets ranked first.

### What the values mean

| Confidence | Use for |
|-----------|---------|
| **0.9 — 1.0** | Hard rules, verified facts, team standards |
| **0.7 — 0.9** | Solid knowledge, well-tested patterns |
| **0.5 — 0.7** | Reasonable advice, context-dependent |
| **0.3 — 0.5** | Experimental, unverified, "try this" |
| **0.1 — 0.3** | Weak signals, hunches, temporary notes |

### Who decides it?

**You do**, when storing. It's not calculated automatically. If you don't provide it, it defaults to **0.8**.

Think of it as: "how confident am I that this is correct and should influence future decisions?"

### Examples by confidence tier

#### 0.9 — 1.0: Hard rules, verified facts, team standards
These are non-negotiable. The team has agreed on them or they're industry standards.
```
store a memory with key 'rule-no-any-types' and content 'Never use the any type in TypeScript. Use unknown for truly unknown types, then narrow with type guards. This is enforced by our tsconfig strict mode and CI linting.' as knowledge type with tags 'coding-practice' and 'typescript' and confidence 1.0
```
```
store a memory with key 'rule-main-branch-protected' and content 'Never push directly to main. All changes go through pull requests with at least one approval. CI must pass before merge. This is enforced by GitHub branch protection rules.' as knowledge type with tags 'workflow' and 'git' and confidence 1.0
```

#### 0.7 — 0.9: Solid knowledge, well-tested patterns
Reliable advice that works in most cases but might have exceptions.
```
store a memory with key 'pattern-react-custom-hooks' and content 'Extract shared component logic into custom hooks. If two or more components share the same useEffect or useState pattern, create a custom hook. Name them with the use prefix (useAuth, useFetch, useDebounce).' as knowledge type with tags 'react' and 'patterns' and confidence 0.85
```
```
store a memory with key 'pattern-retry-with-backoff' and content 'When calling external APIs, implement retry with exponential backoff. Start at 100ms, double each attempt, cap at 5 retries. Add jitter to avoid thundering herd. Use libraries like p-retry or axios-retry instead of rolling your own.' as knowledge type with tags 'api' and 'resilience' and confidence 0.8
```

#### 0.5 — 0.7: Reasonable advice, context-dependent
Good ideas that depend on the situation. Not always applicable.
```
store a memory with key 'tip-graphql-over-rest' and content 'Consider GraphQL over REST when the frontend needs flexible queries across many related entities. REST is simpler for CRUD-heavy APIs with predictable access patterns. GraphQL adds complexity — only use it when the flexibility pays off.' as knowledge type with tags 'api' and 'architecture' and confidence 0.6
```
```
store a memory with key 'tip-server-components' and content 'React Server Components can reduce client bundle size for data-heavy pages. Good for dashboards and content sites. Less useful for highly interactive apps where most components need client-side state anyway.' as knowledge type with tags 'react' and 'performance' and confidence 0.65
```

#### 0.3 — 0.5: Experimental, unverified, "try this"
Things you've heard about or tried briefly. Worth remembering but not relying on.
```
store a memory with key 'experiment-bun-runtime' and content 'Bun might be a faster alternative to Node.js for this project. Initial benchmarks look promising for startup time and file I/O. Not fully tested with our dependency tree yet — some native modules may not work.' as knowledge type with tags 'tooling' and 'experimental' and confidence 0.4
```
```
store a memory with key 'experiment-drizzle-orm' and content 'Drizzle ORM looked lighter than Prisma in a quick evaluation. SQL-like syntax, no code generation step, smaller bundle. Have not tested migrations or complex joins yet. Might be worth a spike.' as knowledge type with tags 'database' and 'experimental' and confidence 0.4
```

#### 0.1 — 0.3: Weak signals, hunches, temporary notes
Fleeting observations. Kept for reference but should not drive decisions.
```
store a memory with key 'hunch-flaky-ci-tuesdays' and content 'CI seems to fail more often on Tuesday mornings. Might be related to the npm registry cache refresh or higher GitHub Actions load. No hard data yet — just a pattern noticed over 3 weeks.' as operational type with tags 'ci' and 'observation' and confidence 0.2
```
```
store a memory with key 'note-user-complaint-slow-search' and content 'One user mentioned search feels slow on large datasets. Could be N+1 query issue or missing index. Need to profile before drawing conclusions.' as operational type with tags 'performance' and 'user-feedback' and confidence 0.15
```

### How confidence affects ranking

If all three of these are stored and you query "how to build an API":

| Memory | Confidence | Resulting score boost |
|--------|-----------|---------------------|
| `arch-rule-api-versioning` | 0.95 | Ranked 1st |
| `pattern-retry-with-backoff` | 0.80 | Ranked 2nd |
| `tip-graphql-over-rest` | 0.60 | Ranked 3rd |

The high-confidence rule surfaces first because the agent should prioritize verified standards over context-dependent tips.

---

## Architecture Rules

### arch-rule-split-apps
**Tags:** `architecture`, `best-practice` | **Confidence:** 0.95
```
store a memory with key 'arch-rule-split-apps' and content 'For any medium to large scale application, always split the application into a separate backend and frontend app. Backend should be its own service with API endpoints. Frontend should be its own app consuming those APIs. This separation enables independent deployment, scaling, testing, and team ownership.' as knowledge type with tags 'architecture' and 'best-practice' and confidence 0.95
```

### arch-rule-api-versioning
**Tags:** `architecture`, `api` | **Confidence:** 0.95
```
store a memory with key 'arch-rule-api-versioning' and content 'Always version your APIs from day one. Use URL path versioning (e.g., /api/v1/) for public APIs. Never introduce breaking changes without a new version. Deprecate old versions with a sunset header and migration timeline.' as knowledge type with tags 'architecture' and 'api' and confidence 0.95
```

### arch-rule-stateless-services
**Tags:** `architecture`, `scaling` | **Confidence:** 0.95
```
store a memory with key 'arch-rule-stateless-services' and content 'Design backend services to be stateless. Store session data in external stores like Redis, not in memory. This enables horizontal scaling — any instance can handle any request without sticky sessions.' as knowledge type with tags 'architecture' and 'scaling' and confidence 0.95
```

### arch-rule-database-per-service
**Tags:** `architecture`, `microservices` | **Confidence:** 0.9
```
store a memory with key 'arch-rule-database-per-service' and content 'Each microservice should own its own database. Never share databases between services. Services communicate through APIs or events, not by reading each other tables directly. This prevents tight coupling and allows independent schema evolution.' as knowledge type with tags 'architecture' and 'microservices' and confidence 0.9
```

### arch-rule-env-config
**Tags:** `architecture`, `configuration` | **Confidence:** 0.95
```
store a memory with key 'arch-rule-env-config' and content 'Never hardcode configuration values like database URLs, API keys, or feature flags. Use environment variables or a config service. Follow the 12-factor app methodology: config varies between deploys, code does not.' as knowledge type with tags 'architecture' and 'configuration' and confidence 0.95
```

---

## Coding Practice Rules

### code-rule-single-responsibility
**Tags:** `coding-practice`, `clean-code` | **Confidence:** 0.9
```
store a memory with key 'code-rule-single-responsibility' and content 'Every function should do one thing. If a function name requires the word "and", it should be split. Keep functions under 30 lines. If you need to scroll to read a function, it is too long.' as knowledge type with tags 'coding-practice' and 'clean-code' and confidence 0.9
```

### code-rule-error-handling
**Tags:** `coding-practice`, `error-handling` | **Confidence:** 0.95
```
store a memory with key 'code-rule-error-handling' and content 'Never swallow errors silently. Always handle errors explicitly — log them, propagate them, or convert them into user-friendly messages. Use typed errors or error codes, not just string messages. Fail fast at system boundaries, recover gracefully at user boundaries.' as knowledge type with tags 'coding-practice' and 'error-handling' and confidence 0.95
```

### code-rule-no-magic-values
**Tags:** `coding-practice`, `clean-code` | **Confidence:** 0.9
```
store a memory with key 'code-rule-no-magic-values' and content 'Never use magic numbers or strings in code. Extract them into named constants with clear intent. BAD: if (status === 3). GOOD: if (status === ORDER_STATUS.SHIPPED). This makes code self-documenting and easy to change.' as knowledge type with tags 'coding-practice' and 'clean-code' and confidence 0.9
```

### code-rule-testing-pyramid
**Tags:** `coding-practice`, `testing` | **Confidence:** 0.95
```
store a memory with key 'code-rule-testing-pyramid' and content 'Follow the testing pyramid: many unit tests (fast, isolated), fewer integration tests (test boundaries), and minimal E2E tests (slow, brittle). Aim for 80% coverage on business logic. Test behavior, not implementation details. Every bug fix should come with a regression test.' as knowledge type with tags 'coding-practice' and 'testing' and confidence 0.95
```

### code-rule-naming-conventions
**Tags:** `coding-practice`, `clean-code` | **Confidence:** 0.9
```
store a memory with key 'code-rule-naming-conventions' and content 'Use descriptive names that reveal intent. Variables should be nouns (userCount, orderTotal). Functions should be verbs (calculateTotal, validateInput). Booleans should be prefixed with is/has/can (isActive, hasPermission). Avoid abbreviations except universally understood ones (id, url, api).' as knowledge type with tags 'coding-practice' and 'clean-code' and confidence 0.9
```

---

## Security Rules (OWASP)

### sec-rule-input-validation
**Tags:** `security`, `owasp`, `injection` | **Confidence:** 0.95
```
store a memory with key 'sec-rule-input-validation' and content 'OWASP A03 Injection: Never trust user input. Validate and sanitize all input at system boundaries. Use parameterized queries for SQL — never concatenate user input into queries. Use allowlists over denylists. Validate data type, length, range, and format.' as knowledge type with tags 'security' and 'owasp' and 'injection' and confidence 0.95
```

### sec-rule-authentication
**Tags:** `security`, `owasp`, `authentication` | **Confidence:** 0.95
```
store a memory with key 'sec-rule-authentication' and content 'OWASP A07 Authentication Failures: Use bcrypt or argon2 for password hashing, never MD5 or SHA alone. Enforce strong passwords (12+ chars). Implement account lockout after failed attempts. Use MFA for sensitive operations. Store sessions server-side with secure, httpOnly, sameSite cookies.' as knowledge type with tags 'security' and 'owasp' and 'authentication' and confidence 0.95
```

### sec-rule-xss-prevention
**Tags:** `security`, `owasp`, `xss` | **Confidence:** 0.95
```
store a memory with key 'sec-rule-xss-prevention' and content 'OWASP A03 XSS: Always encode output based on context (HTML, JS, URL, CSS). Use frameworks that auto-escape by default (React, Angular). Never use innerHTML or dangerouslySetInnerHTML with user data. Set Content-Security-Policy headers. Sanitize HTML if rich text is required using a library like DOMPurify.' as knowledge type with tags 'security' and 'owasp' and 'xss' and confidence 0.95
```

### sec-rule-access-control
**Tags:** `security`, `owasp`, `access-control` | **Confidence:** 0.95
```
store a memory with key 'sec-rule-access-control' and content 'OWASP A01 Broken Access Control: Check authorization on every request server-side, never rely on client-side checks. Use deny-by-default — explicitly grant permissions, not deny them. Validate that the authenticated user owns the resource they are accessing. Log all access control failures.' as knowledge type with tags 'security' and 'owasp' and 'access-control' and confidence 0.95
```

### sec-rule-secrets-management
**Tags:** `security`, `owasp`, `secrets` | **Confidence:** 0.95
```
store a memory with key 'sec-rule-secrets-management' and content 'OWASP A02 Cryptographic Failures: Never commit secrets to git. Use environment variables or a secrets manager (Vault, AWS Secrets Manager). Rotate keys regularly. Use TLS everywhere. Encrypt sensitive data at rest with AES-256. Never roll your own crypto.' as knowledge type with tags 'security' and 'owasp' and 'secrets' and confidence 0.95
```

### sec-rule-dependency-security
**Tags:** `security`, `owasp`, `dependencies` | **Confidence:** 0.9
```
store a memory with key 'sec-rule-dependency-security' and content 'OWASP A06 Vulnerable Components: Run npm audit or pnpm audit regularly. Pin dependency versions in lock files. Use Dependabot or Renovate for automated updates. Never use deprecated or unmaintained packages. Check CVE databases before adding new dependencies.' as knowledge type with tags 'security' and 'owasp' and 'dependencies' and confidence 0.9
```

---

## Testing Queries

After storing all rules, try these queries to verify search works:

```
query memory for 'how to handle user input safely'
query memory for 'clean code naming'
query memory for 'scaling backend services'
query memory for 'OWASP authentication'
query memory for 'API design best practices'
```
