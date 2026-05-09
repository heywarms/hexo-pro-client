# Hermes Agent Integration

Hexo Pro now exposes two agent-facing entry points:

- `hexo-pro-mcp`: an MCP stdio server for Hermes Agent and other MCP clients.
- `hexo-pro-agent`: a JSON-printing CLI for local debugging, scripts, and CI.

Both entry points call the existing Hexo Pro HTTP API at `/hexopro/api`.
They can discover the current Hexo Pro URL automatically from runtime metadata.

## Prerequisites

Start Hexo Pro first. In debug mode, `hexo-pro/debug.js` writes runtime metadata to:

```text
<blog>/.hexo-pro/runtime.json
~/.hexo-pro/runtime.json
```

MCP and CLI resolve the API URL in this order:

1. `HEXO_PRO_BASE_URL`
2. `HEXOPRO_BASE_URL`
3. `HEXO_PRO_AGENT_PORT` or `HEXOPRO_AGENT_PORT`
4. `HEXO_PRO_RUNTIME_FILE`
5. `<HEXOPRO_BASE_DIR>/.hexo-pro/runtime.json`
6. `~/.hexo-pro/runtime.json`
7. Local probe of common ports: `8081`, `8001`, `4000`, `3000`, `3001`, `5173`

For a single local Hexo Pro instance, no URL env var is required. For multiple blogs, pass the blog directory:

```bash
export HEXOPRO_BASE_DIR=/Users/warms/Workspace/code/node_project/blog
```

If login is enabled and the tool still calls the normal HTTP API, set a JWT token:

```bash
export HEXO_PRO_TOKEN=your-token
```

## MCP Server

### Enable Agent Access From Hexo Pro

Open Hexo Pro settings and go to `MCP Server`.

1. Select the scopes the agent may use.
2. Click `开启并生成 Token`.
3. Copy the token immediately. It is only shown when created or rotated.
4. Copy the generated Hermes config.

When `HEXO_PRO_MCP_TOKEN` is present, the MCP server uses the MCP Agent API:

```text
/hexopro/api/mcp/agent/*
```

These endpoints do not require the normal login JWT. They only accept requests with:

```text
X-Hexo-Pro-Mcp-Token: <token>
```

The token is stored server-side as a SHA-256 hash and checked against the enabled scopes.

Run the MCP server:

```bash
yarn agent:mcp
```

Or directly:

```bash
node /Users/warms/Workspace/code/node_project/hexo-pro-client/bin/hexo-pro-mcp.mjs
```

Example Hermes MCP server configuration:

```json
{
  "mcpServers": {
    "hexo-pro": {
      "command": "node",
      "args": [
        "/Users/warms/Workspace/code/node_project/hexo-pro-client/bin/hexo-pro-mcp.mjs"
      ],
      "env": {
        "HEXOPRO_BASE_DIR": "/Users/warms/Workspace/code/node_project/blog",
        "HEXO_PRO_MCP_TOKEN": "paste-token-here",
        "HEXO_PRO_AUTO_START": "true"
      }
    }
  }
}
```

With `HEXO_PRO_AUTO_START=true`, the MCP server first tries to find an existing Hexo Pro runtime. If none is running, it starts a local headless server from `hexo-pro/headless_server.js`, waits for it to become healthy, then calls the MCP Agent API. The headless server listens only on `127.0.0.1` and writes the same runtime metadata as the debug server.

Available tools:

- `hexo_search_posts`
- `hexo_list_posts`
- `hexo_get_post`
- `hexo_create_draft`
- `hexo_update_post`
- `hexo_publish_post`
- `hexo_unpublish_post`
- `hexo_deploy`
- `hexo_get_deploy_status`

## CLI

Create a draft:

```bash
yarn agent:cli draft --title "Hello MCP" --content "# Hello"
```

Search posts:

```bash
yarn agent:cli search MCP
```

Update a post:

```bash
yarn agent:cli update "https://example.com/hello/" --content "# Updated"
```

Publish a draft:

```bash
yarn agent:cli publish "https://example.com/hello/"
```

Start a deployment:

```bash
yarn agent:cli deploy --targets '["github"]'
```

Check deployment status:

```bash
yarn agent:cli deploy-status
```
