const assert = require('assert');
const { test } = require('node:test');

const { HexoProAgentClient } = require('../agent/client');
const { createToolHandlers, toolDefinitions } = require('../agent/tools');

test('HexoProAgentClient normalizes base URL and sends JSON requests', async () => {
  const requests = [];
  const client = new HexoProAgentClient({
    baseUrl: 'http://127.0.0.1:4000/',
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify({ ok: true })
      };
    }
  });

  const result = await client.request('POST', '/posts/new', { title: 'Hello' });

  assert.deepStrictEqual(result, { ok: true });
  assert.strictEqual(requests[0].url, 'http://127.0.0.1:4000/hexopro/api/posts/new');
  assert.strictEqual(requests[0].options.method, 'POST');
  assert.strictEqual(requests[0].options.body, JSON.stringify({ title: 'Hello' }));
  assert.strictEqual(requests[0].options.headers['Content-Type'], 'application/json');
});

test('createDraft maps title, content, tags, and categories to Hexo Pro API calls', async () => {
  const calls = [];
  const client = {
    createDraft: HexoProAgentClient.prototype.createDraft,
    updatePost: async (...args) => calls.push(['updatePost', ...args]),
    request: async (method, path, body) => {
      calls.push(['request', method, path, body]);
      return { permalink: 'https://example.com/hello/' };
    }
  };

  const result = await client.createDraft({
    title: 'Hello',
    content: '# Hello',
    tags: ['agent'],
    categories: ['notes']
  });

  assert.strictEqual(result.permalink, 'https://example.com/hello/');
  assert.deepStrictEqual(calls, [
    ['request', 'POST', '/posts/new', { title: 'Hello', tags: ['agent'], categories: ['notes'] }],
    ['updatePost', 'https://example.com/hello/', { _content: '# Hello' }]
  ]);
});

test('MCP token switches client calls to MCP agent endpoints', async () => {
  const requests = [];
  const client = new HexoProAgentClient({
    baseUrl: 'http://127.0.0.1:8081',
    mcpToken: 'hxp_mcp_secret',
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify({ ok: true })
      };
    }
  });

  await client.publishPost({ permalink: 'https://example.com/hello/' });

  assert.strictEqual(requests[0].url, 'http://127.0.0.1:8081/hexopro/api/mcp/agent/posts/publish');
  assert.strictEqual(requests[0].options.headers['X-Hexo-Pro-Mcp-Token'], 'hxp_mcp_secret');
  assert.strictEqual(
    requests[0].options.body,
    JSON.stringify({ permalink: 'https://example.com/hello/' })
  );
});

test('tool definitions expose Hermes-friendly names with JSON schemas', () => {
  const names = toolDefinitions.map(tool => tool.name);

  assert.ok(names.includes('hexo_create_draft'));
  assert.ok(names.includes('hexo_update_post'));
  assert.ok(names.includes('hexo_publish_post'));
  assert.ok(names.includes('hexo_deploy'));
  assert.strictEqual(
    toolDefinitions.find(tool => tool.name === 'hexo_create_draft').inputSchema.required[0],
    'title'
  );
});

test('tool handlers call client methods and return structured JSON text', async () => {
  const handlers = createToolHandlers({
    searchPosts: async ({ query }) => ({ data: [{ title: query }] })
  });

  const result = await handlers.hexo_search_posts({ query: 'MCP' });

  assert.deepStrictEqual(result, {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ data: [{ title: 'MCP' }] }, null, 2)
      }
    ]
  });
});
