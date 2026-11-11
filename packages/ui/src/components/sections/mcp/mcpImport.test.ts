import { describe, expect, test } from 'bun:test';

import { parseImportedMcpSnippet } from './mcpImport';

describe('parseImportedMcpSnippet', () => {
  test('reads a canonical HTTP server record', () => {
    const server = parseImportedMcpSnippet(JSON.stringify({
      serverId: 'context7',
      label: 'context7',
      enabled: true,
      transport: { type: 'http', url: 'https://mcp.context7.com/mcp' },
    }));
    expect(server.serverId).toBe('context7');
    expect(server.transport).toEqual({ type: 'http', url: 'https://mcp.context7.com/mcp' });
  });

  test('reads a canonical stdio server record', () => {
    const server = parseImportedMcpSnippet(JSON.stringify({
      serverId: 'files',
      label: 'Files',
      enabled: true,
      transport: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'] },
    }));
    expect(server.transport.type).toBe('stdio');
  });

  test('keeps credential references instead of inline secrets', () => {
    const server = parseImportedMcpSnippet(JSON.stringify({
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
