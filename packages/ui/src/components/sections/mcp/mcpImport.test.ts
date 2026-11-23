import { describe, expect, test } from 'bun:test';

import { McpImportError, parseImportedMcpSnippet } from './mcpImport';

describe('parseImportedMcpSnippet', () => {
  const standard = (entry: object) => JSON.stringify({ mcpServers: { tools: entry } });

  test('imports Claude stdio credentials as write-only drafts', () => {
    const result = parseImportedMcpSnippet(standard({ command: 'npx', args: ['-y', 'tools'], env: { API_KEY: 'fixture-secret' } }));
    expect(result.server.transport).toEqual({ type: 'stdio', command: 'npx', args: ['-y', 'tools'] });
    expect(result.server.label).toBe('tools');
    expect(result.credentials).toEqual([{ key: 'API_KEY', value: 'fixture-secret' }]);
    expect(JSON.stringify(result.server)).not.toContain('fixture-secret');
  });

  test('imports Cursor URL and typed HTTP/SSE entries', () => {
    for (const type of [undefined, 'http', 'streamable-http', 'sse']) {
      const result = parseImportedMcpSnippet(standard({ type, url: 'https://mcp.example/sse', headers: { Authorization: 'fixture-header' }, disabled: true }));
      expect(result.server.transport).toEqual({ type: type === 'sse' ? 'sse' : 'http', url: 'https://mcp.example/sse' });
      expect(result.server.enabled).toBe(false);
      expect(result.credentials).toEqual([{ key: 'Authorization', value: 'fixture-header' }]);
      expect(JSON.stringify(result.server)).not.toContain('fixture-header');
    }
    expect(parseImportedMcpSnippet(standard({ command: 'node', enabled: false })).server.enabled).toBe(false);
  });

  test('returns dropped native field names only', () => {
    const result = parseImportedMcpSnippet(standard({ command: 'node', timeout: 45000, cwd: '/private/path', instructions: false, requestIdFormat: 'string', oauth: { clientSecret: 'fixture-oauth' }, auth: {}, envFile: '/private/env' }));
    expect(result.droppedFields).toEqual(['timeout', 'cwd', 'instructions', 'requestIdFormat', 'oauth', 'auth', 'envFile']);
    expect(JSON.stringify(result)).not.toContain('/private');
    expect(JSON.stringify(result)).not.toContain('fixture-oauth');
  });

  test('rejects unsafe and ambiguous snippets without reflecting values', () => {
    const cases = [
      { entry: { url: 'https://mcp.linear.app/sse?team=eng' }, code: 'transport' },
      { entry: { url: 'https://user:password@mcp.example' }, code: 'transport' },
      { entry: { command: '/opt/private/bin/tool' }, code: 'transport' },
      { entry: { command: 'node', env: { TOKEN: '${VAR}' } }, code: 'expression' },
      { entry: { command: 'node', env: { TOKEN: '!cmd' } }, code: 'expression' },
      { entry: { url: 'https://mcp.example', headers: { TOKEN: '!cmd' } }, code: 'expression' },
      { entry: { command: 'node', url: 'https://mcp.example' }, code: 'transport' },
      { entry: { url: 'https://mcp.example', type: 'unknown' }, code: 'transport' },
      { entry: {}, code: 'transport' },
    ];
    for (const { entry, code } of cases) {
      try { parseImportedMcpSnippet(standard(entry)); throw new Error('Expected rejection'); }
      catch (error) {
        expect(error).toBeInstanceOf(McpImportError);
        if (!(error instanceof McpImportError)) throw error;
        expect(error.code).toBe(code);
        if (code === 'expression') expect(error.message).toBe('Unsupported credential expression: TOKEN');
        for (const value of ['https://', 'team=eng', '/opt/private', '${VAR}', '!cmd', 'password', 'node', 'unknown']) expect(error.message).not.toContain(value);
      }
    }
  });

  test('rejects multiple or empty server maps with typed errors', () => {
    expect(() => parseImportedMcpSnippet(JSON.stringify({ mcpServers: { a: { command: 'node' }, b: { command: 'node' } } }))).toThrow('Import one server at a time.');
    expect(() => parseImportedMcpSnippet('{"mcpServers":{}}')).toThrow(McpImportError);
  });

  test('reads a canonical HTTP server record', () => {
    const { server } = parseImportedMcpSnippet(JSON.stringify({
      serverId: 'context7',
      label: 'context7',
      enabled: true,
      transport: { type: 'http', url: 'https://mcp.context7.com/mcp' },
    }));
    expect(server.serverId).toBe('context7');
    expect(server.transport).toEqual({ type: 'http', url: 'https://mcp.context7.com/mcp' });
  });

  test('reads a canonical stdio server record', () => {
    const { server } = parseImportedMcpSnippet(JSON.stringify({
      serverId: 'files',
      label: 'Files',
      enabled: true,
      transport: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'] },
    }));
    expect(server.transport.type).toBe('stdio');
  });

  test('keeps credential references instead of inline secrets', () => {
    const { server } = parseImportedMcpSnippet(JSON.stringify({
      serverId: 'stitch',
      label: 'stitch',
      enabled: true,
      transport: { type: 'http', url: 'https://stitch.googleapis.com/mcp', credentialRef: 'credential.stitch' },
    }));
    expect(server.transport).toMatchObject({ credentialRef: 'credential.stitch' });
  });

  test('rejects the retired engine shape', () => {
    expect(() => parseImportedMcpSnippet(JSON.stringify({
      mcp: { stitch: { type: 'remote', url: 'https://stitch.googleapis.com/mcp' } },
    }))).toThrow();
  });

  test('rejects a server without a transport', () => {
    expect(() => parseImportedMcpSnippet(JSON.stringify({ serverId: 'broken', label: 'broken', enabled: true }))).toThrow();
  });

  test('rejects invalid JSON', () => {
    expect(() => parseImportedMcpSnippet('{not json')).toThrow();
  });
});
