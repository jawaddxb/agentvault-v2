import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const BASE_URL = process.env.MARKETPLACE_URL ?? 'http://localhost:3001';

const server = new Server(
  { name: 'mock-mcp', version: '0.1.0' },
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
      const url = `${BASE_URL}/api/search?type=skill&q=${encodeURIComponent(query)}`;
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
    const { name: skillName, description, content, tags, apiKey } = args as Record<string, unknown>;
    if (!skillName || !content || !apiKey) {
      return { content: [{ type: 'text' as const, text: 'Error: name, content, and apiKey are required' }], isError: true };
    }
    try {
      const res = await fetch(`${BASE_URL}/api/datasets`, {
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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('MCP server failed to start:', err);
  process.exit(1);
});
