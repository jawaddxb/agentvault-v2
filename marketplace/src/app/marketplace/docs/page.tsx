export default function DocsPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold mb-6">API Reference</h1>

      <Section title="Authentication">
        <p className="mb-3 text-[var(--text-secondary)]">
          Register with a display name and email. Login with email only (no password for mock).
          A JWT session cookie is set on login for browser-based access.
        </p>

        <Endpoint method="POST" path="/api/auth/register" auth="Public">
          <CodeBlock>{`// Request
{ "username": "Naeem", "email": "naeem@example.com" }

// Response 201
{ "id": 1, "username": "Naeem", "email": "naeem@example.com" }`}</CodeBlock>
        </Endpoint>

        <Endpoint method="POST" path="/api/auth/login" auth="Public">
          <CodeBlock>{`// Request
{ "email": "naeem@example.com" }

// Response 200 (sets av_session cookie)
{ "id": 1, "username": "Naeem", "email": "naeem@example.com" }`}</CodeBlock>
        </Endpoint>

        <Endpoint method="GET" path="/api/auth/me" auth="JWT Cookie">
          <CodeBlock>{`// Response 200
{ "id": 1, "username": "Naeem", "email": "naeem@example.com" }`}</CodeBlock>
        </Endpoint>
      </Section>

      <Section title="Datasets & Skills">
        <Endpoint method="GET" path="/api/datasets" auth="JWT Cookie">
          <p className="text-sm text-[var(--text-secondary)] mb-2">Query params: <code>?type=dataset|skill</code> <code>&q=search</code> <code>&category=knowledge|operational|query_cache</code></p>
          <CodeBlock>{`// Response 200
{ "datasets": [{ "id": 1, "name": "...", "description": "...",
  "category": "knowledge", "tags": ["api"], "entryCount": 5,
  "author": "Naeem", "createdAt": "2026-03-07T..." }] }`}</CodeBlock>
        </Endpoint>

        <Endpoint method="POST" path="/api/datasets" auth="JWT Cookie (datasets) or API Key (skills)">
          <p className="text-sm text-[var(--text-secondary)] mb-2">
            Datasets (category: knowledge, operational, query_cache) use JWT cookie auth.
            Skills (category: skills) require an API key via <code>Authorization: Bearer av_xxx</code> header.
          </p>
          <CodeBlock>{`// Request — Dataset (JWT cookie auth)
{ "name": "Stripe Guide", "description": "Integration tips",
  "category": "knowledge", "content": "Step 1: ...",
  "tags": ["stripe", "payments"] }

// Request — Skill (API key auth)
// Header: Authorization: Bearer av_3a8b2c1d9e0f...
{ "name": "Code Review Agent", "description": "Reviews PRs",
  "category": "skills", "content": "...",
  "tags": ["code-review", "agent"] }

// Response 201
{ "id": 1, "name": "Stripe Guide" }`}</CodeBlock>
        </Endpoint>

        <Endpoint method="GET" path="/api/datasets/:id" auth="JWT Cookie or API Key">
          <CodeBlock>{`// Response 200
{ "id": 1, "name": "...", "description": "...",
  "category": "knowledge", "content": "full content here",
  "tags": [...], "entryCount": 5, "author": "Naeem",
  "createdAt": "...", "updatedAt": "..." }`}</CodeBlock>
        </Endpoint>
      </Section>

      <Section title="API Keys">
        <p className="mb-3 text-[var(--text-secondary)]">
          API keys authenticate programmatic access (MCP, curl, agents). Format: <code>av_</code> + 32 hex chars.
          The full key is shown once at creation. Only the SHA-256 hash is stored.
        </p>

        <Endpoint method="GET" path="/api/api-keys" auth="JWT Cookie">
          <CodeBlock>{`// Response 200
{ "keys": [{ "id": 1, "prefix": "av_3a8b2c1d",
  "label": "my-agent", "createdAt": "...", "revoked": false }] }`}</CodeBlock>
        </Endpoint>

        <Endpoint method="POST" path="/api/api-keys" auth="JWT Cookie">
          <CodeBlock>{`// Request
{ "label": "my-agent" }  // label is required

// Response 201 (full key shown ONCE)
{ "id": 1, "key": "av_3a8b2c1d9e0f...", "prefix": "av_3a8b2c1d", "label": "my-agent" }`}</CodeBlock>
        </Endpoint>

        <Endpoint method="DELETE" path="/api/api-keys" auth="JWT Cookie">
          <CodeBlock>{`// Request
{ "id": 1 }

// Response 200
{ "revoked": true }`}</CodeBlock>
        </Endpoint>
      </Section>

      <Section title="Search API (Public)">
        <p className="mb-3 text-[var(--text-secondary)]">
          Public search endpoint — no authentication required. Use <code>type</code> to filter between datasets and skills.
          This is the endpoint MCP tools and agents call.
        </p>

        <Endpoint method="GET" path="/api/search" auth="Public">
          <p className="text-sm text-[var(--text-secondary)] mb-2">Query params: <code>?type=dataset|skill</code> <code>&q=search</code> <code>&category=knowledge</code></p>
          <CodeBlock>{`// Example
curl "http://localhost:3001/api/search?type=skill&q=code+review"

// Response 200
{ "results": [{ "id": 1, "name": "...", "description": "...",
  "category": "skills", "tags": [...], "entryCount": 5,
  "author": "Naeem", "createdAt": "..." }] }`}</CodeBlock>
        </Endpoint>
      </Section>

      <Section title="Users">
        <Endpoint method="GET" path="/api/users" auth="JWT Cookie">
          <CodeBlock>{`// Response 200
{ "users": [{ "id": 1, "username": "Naeem",
  "email": "naeem@example.com", "createdAt": "...",
  "keysCount": 2, "datasetsCount": 5 }] }`}</CodeBlock>
        </Endpoint>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="text-lg font-semibold mb-4 pb-2 border-b border-[var(--border)]">{title}</h2>
      {children}
    </div>
  );
}

function Endpoint({ method, path, auth, children }: { method: string; path: string; auth: string; children: React.ReactNode }) {
  const methodColor = method === 'GET' ? 'text-green-600' : method === 'POST' ? 'text-blue-600' : 'text-red-600';
  return (
    <div className="mb-5 p-4 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border)]">
      <div className="flex items-center gap-3 mb-2">
        <span className={`font-mono font-bold text-sm ${methodColor}`}>{method}</span>
        <code className="text-sm font-mono">{path}</code>
        <span className="ml-auto text-xs px-2 py-0.5 bg-[var(--border)] rounded-full text-[var(--text-secondary)]">{auth}</span>
      </div>
      {children}
    </div>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre className="text-xs font-mono bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg p-3 overflow-x-auto">
      {children}
    </pre>
  );
}
