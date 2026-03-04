# Security

## What AgentVault protects against

| Threat | Protection |
|--------|-----------|
| Another process reading your vault files | AES-256-GCM encryption at rest |
| Brute-force attacks on the vault file | scrypt key derivation (~150ms per attempt) |
| Data tampering (modified vault file) | GCM authentication tag — any modification fails decryption |
| Agent leaking secrets to other agents | Permission profiles + sandbox isolation |
| Accidentally committing secrets to git | `.agentvault/` should be in `.gitignore` |
| Log files capturing secrets | Secrets are never logged; audit log records key names only |
| Shell history capturing passphrase | Passphrase comes from env var or interactive prompt, never CLI args |

## What AgentVault does NOT protect against

| Threat | Reality |
|--------|---------|
| Root access to the machine | Root can read any file. AgentVault can't protect against root. |
| Malware running as your user | Malware running as you can read your env vars and files just like you can. |
| Side-channel attacks | No protection against timing attacks, speculative execution, etc. |
| Quantum computing | AES-256 and scrypt are currently quantum-resistant, but not forever. |
| Forgetting your passphrase | There is no recovery. Vault is unrecoverable without the passphrase. |

---

## Passphrase best practices

**The passphrase is the root of all security.** If someone gets your passphrase, they can decrypt everything.

```bash
# ✅ Good: read from env var (set in your shell profile or CI secrets)
export AGENTVAULT_PASSPHRASE="$(op read 'op://Personal/AgentVault/passphrase')"

# ✅ Good: read from 1Password CLI at runtime
export AGENTVAULT_PASSPHRASE="$(op item get AgentVault --fields passphrase)"

# ✅ Good: interactive prompt (no env var needed, type it each time)
agentvault secret add OPENAI_KEY "sk-..."
# Password: ████████████████

# ❌ Bad: inline in shell command (appears in ps, history, logs)
AGENTVAULT_PASSPHRASE=my-passphrase agentvault secret get OPENAI_KEY

# ❌ Bad: stored in .env file in the repo
echo "AGENTVAULT_PASSPHRASE=my-passphrase" >> .env   # DON'T DO THIS
```

**Passphrase requirements:**
- Minimum 12 characters (enforced)
- Longer is always better — use a passphrase, not a password
- Use a password manager (1Password, Bitwarden) to generate and store it

---

## AGENTVAULT_PASSPHRASE environment variable

The passphrase can be set in:

1. **Shell profile** (`~/.zshrc`, `~/.bashrc`): set and forget on the machine
2. **CI/CD secrets**: GitHub Actions secrets, Railway env vars, etc.
3. **Secret manager at runtime**: `export AGENTVAULT_PASSPHRASE="$(op read ...)"` in scripts

**Important:** The env var is read fresh each time. It's not cached between commands. So you can `unset AGENTVAULT_PASSPHRASE` after sensitive operations:

```bash
export AGENTVAULT_PASSPHRASE="$(op read 'op://Personal/AgentVault/passphrase')"
agentvault wrap -p moderate -- claude-code .
unset AGENTVAULT_PASSPHRASE
```

---

## File permissions

AgentVault enforces strict file permissions on creation:

| Path | Mode | Why |
|------|------|-----|
| `.agentvault/` | `0700` | Only owner can list directory contents |
| `vault.json` | `0600` | Only owner can read/write |
| `memory.json` | `0600` | Only owner can read/write |
| `sessions.json` | `0600` | Only owner can read/write |
| `audit.db` | `0600` | Only owner can read/write |
| `profiles/*.json` | `0644` | World-readable — profiles contain no secrets |

**Note:** If you're on a shared machine, verify these permissions are correct:

```bash
ls -la .agentvault/
# drwx------ 2 youruser staff  64 Mar  4 05:00 .
# -rw------- 1 youruser staff  13K Mar  4 05:00 vault.json
# -rw------- 1 youruser staff  800K Mar  4 05:00 memory.json
```

---

## Audit log

Every secret access via `wrap` or `secret get` is logged to `audit.db` (SQLite):

```bash
agentvault audit show
# 2026-03-04 04:55:12  secret.get    OPENAI_KEY        profile=moderate  agent=claude-code
# 2026-03-04 04:55:12  secret.get    GITHUB_TOKEN      profile=moderate  agent=claude-code
# 2026-03-04 04:55:12  secret.deny   AWS_SECRET_KEY    profile=moderate  agent=claude-code
```

The audit log records:
- Timestamp
- Operation (get, deny, redact)
- Key name (never value)
- Profile used
- Agent identifier

The audit log is append-only by design — you can clear it with `agentvault audit clear`, but the intent is to keep it for compliance.

---

## Adversarial audit findings (fixed in v2)

In the security audit of AgentVault v2, the following issues were found and fixed:

| Finding | Severity | Fix |
|---------|----------|-----|
| Passphrase could be passed as CLI flag | High | Removed all passphrase CLI args. Only env var + interactive prompt. |
| Gateway endpoints lacked authentication | Medium | Added signature-based buyer auth on `/checkout` |
| Path traversal in vault export | Medium | Added path sanitization; export passphrase isolated from vault passphrase |
| No rate limiting on MCP server | Low | Added request rate limiting on MCP stdio handler |

---

## gitignore

Always add `.agentvault/` to `.gitignore`:

```bash
echo ".agentvault/" >> .gitignore
```

The profiles directory is safe to commit if you want to share your profile configurations with a team:

```bash
# Optional: commit profiles but not vault data
echo ".agentvault/vault.json" >> .gitignore
echo ".agentvault/memory.json" >> .gitignore
echo ".agentvault/sessions.json" >> .gitignore
echo ".agentvault/audit.db" >> .gitignore
echo ".agentvault/purchased/" >> .gitignore
# Leave profiles/ unignored if you want to share them
```
