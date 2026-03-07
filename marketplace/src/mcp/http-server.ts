import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const MARKETPLACE_URL = process.env.MARKETPLACE_URL ?? 'http://localhost:3001';
const PORT = parseInt(process.env.PORT ?? '3002', 10);

function createServer() {
  const server = new Server(
    { name: 'detectiv-marketplace-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  const TOOLS = [
    {
      name: 'marketplace.search_skills',
      description: 'Search for AI agent skills in the marketplace. Returns matching skills with name, description, tags, and author.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          query: { type: 'string', description: 'Search query to find skills' },
        },
        required: ['query'],
      },
    },
    {
      name: 'marketplace.publish_skill',
      description: 'Publish a new AI agent skill to the marketplace. Requires an API key for authentication.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          name: { type: 'string', description: 'Skill name' },
          description: { type: 'string', description: 'Brief description of the skill' },
          content: { type: 'string', description: 'Skill content — definitions, capabilities, or encrypted memory packages' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Tags for discoverability' },
          priceUsdc: { type: 'number', description: 'Price in USDC. Omit or 0 for free.' },
          apiKey: { type: 'string', description: 'API key (av_xxx format) for authentication' },
        },
        required: ['name', 'content', 'apiKey'],
      },
    },
  ];

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === 'marketplace.search_skills') {
      const query = (args as Record<string, string>).query ?? '';
      try {
        const url = `${MARKETPLACE_URL}/api/search?type=skill&q=${encodeURIComponent(query)}`;
        const res = await fetch(url);
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }));
          return { content: [{ type: 'text' as const, text: `Error: ${err.error ?? res.statusText}` }], isError: true };
        }
        const data = await res.json();
        return { content: [{ type: 'text' as const, text: JSON.stringify(data.results, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text' as const, text: `Fetch failed: ${(e as Error).message}` }], isError: true };
      }
    }

    if (name === 'marketplace.publish_skill') {
      const { name: skillName, description, content, tags, priceUsdc, apiKey } = args as Record<string, unknown>;
      if (!skillName || !content || !apiKey) {
        return { content: [{ type: 'text' as const, text: 'Error: name, content, and apiKey are required' }], isError: true };
      }
      try {
        const res = await fetch(`${MARKETPLACE_URL}/api/datasets`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            name: skillName,
            description: (description as string) ?? '',
            category: 'skills',
            content,
            tags: Array.isArray(tags) ? tags : [],
            priceUsdc: priceUsdc != null && Number(priceUsdc) > 0 ? Number(priceUsdc) : null,
          }),
        });
        const data = await res.json().catch(() => ({ error: res.statusText }));
        if (!res.ok) {
          return { content: [{ type: 'text' as const, text: `Error: ${data.error ?? res.statusText}` }], isError: true };
        }
        return { content: [{ type: 'text' as const, text: `Skill published: id=${data.id}, name="${data.name}"` }] };
      } catch (e) {
        return { content: [{ type: 'text' as const, text: `Fetch failed: ${(e as Error).message}` }], isError: true };
      }
    }

    return { content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }], isError: true };
  });

  return server;
}

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'detectiv-marketplace-mcp' });
});

app.post('/mcp', async (req, res) => {
  const server = createServer();
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on('close', () => {
      transport.close();
      server.close();
    });
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
});

app.get('/mcp', (_req, res) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed. Use POST.' },
    id: null,
  });
});

app.delete('/mcp', (_req, res) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed.' },
    id: null,
  });
});

// --- SSE transport (legacy compatibility) ---
const sseTransports = new Map<string, { transport: SSEServerTransport; server: Server }>();

app.get('/sse', async (req, res) => {
  const server = createServer();
  const transport = new SSEServerTransport('/messages', res);
  sseTransports.set(transport.sessionId, { transport, server });
  res.on('close', () => {
    sseTransports.delete(transport.sessionId);
    transport.close();
    server.close();
  });
  await server.connect(transport);
});

app.post('/messages', async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const entry = sseTransports.get(sessionId);
  if (!entry) {
    res.status(400).json({ error: 'Invalid or expired session' });
    return;
  }
  await entry.transport.handlePostMessage(req, res, req.body);
});

app.listen(PORT, () => {
  console.log(`MCP Streamable HTTP server listening on port ${PORT}`);
  console.log(`Marketplace URL: ${MARKETPLACE_URL}`);
});

process.on('SIGINT', () => {
  console.log('Shutting down MCP server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down MCP server...');
  process.exit(0);
});
