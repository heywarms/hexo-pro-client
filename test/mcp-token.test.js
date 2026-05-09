const assert = require('assert');
const { test } = require('node:test');

const {
  DEFAULT_MCP_SCOPES,
  createMcpToken,
  hashMcpToken,
  hasScopes,
  maskToken,
  verifyMcpToken
} = require('../hexo-pro/mcp_token');

test('createMcpToken returns a plaintext token and persisted hash without storing the secret', () => {
  const result = createMcpToken({ scopes: ['read', 'write'] });

  assert.ok(result.token.startsWith('hxp_mcp_'));
  assert.ok(result.settings.tokenHash);
  assert.notStrictEqual(result.settings.tokenHash, result.token);
  assert.deepStrictEqual(result.settings.scopes, ['read', 'write']);
  assert.strictEqual(result.settings.enabled, true);
});

test('verifyMcpToken validates token hash, enabled flag, and required scopes', () => {
  const token = 'hxp_mcp_test';
  const settings = {
    enabled: true,
    tokenHash: hashMcpToken(token),
    scopes: ['read', 'write']
  };

  assert.strictEqual(verifyMcpToken(settings, token, ['read']).ok, true);
  assert.strictEqual(verifyMcpToken(settings, 'wrong', ['read']).ok, false);
  assert.strictEqual(verifyMcpToken({ ...settings, enabled: false }, token, ['read']).ok, false);
  assert.strictEqual(verifyMcpToken(settings, token, ['publish']).ok, false);
});

test('hasScopes treats admin scope as all capabilities', () => {
  assert.strictEqual(hasScopes(['admin'], DEFAULT_MCP_SCOPES), true);
  assert.strictEqual(hasScopes(['read', 'write'], ['read']), true);
  assert.strictEqual(hasScopes(['read'], ['publish']), false);
});

test('maskToken keeps enough characters for recognition without exposing the secret', () => {
  assert.strictEqual(maskToken('hxp_mcp_abcdefghijklmnopqrstuvwxyz'), 'hxp_mcp...wxyz');
});
