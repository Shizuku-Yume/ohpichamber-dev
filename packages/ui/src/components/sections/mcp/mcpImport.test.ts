import { describe, expect, test } from 'bun:test';
import { parseImportedMcpSnippet } from './mcpImport';

describe('native MCP snippet import', () => {
  test('preserves stdio argument boundaries and credential references', () => {
    const server = { serverId: 'tools', label: 'Tools', enabled: true, transport: { type: 'stdio', command: 'node', args: ['tools.js', 'two words'], envCredentialRefs: { API_KEY: 'credential_1' } } };
    expect(parseImportedMcpSnippet(JSON.stringify(server))).toEqual(server);
  });
  test('keeps HTTP and SSE distinct', () => {
    for (const type of ['http', 'sse']) {
      const server = { serverId: 'tools', label: 'Tools', enabled: false, transport: { type, url: 'https://mcp.example.test' } };
      expect(parseImportedMcpSnippet(JSON.stringify(server))).toEqual(server);
    }
  });
  test('does not import raw secrets or legacy engine controls into native configuration', () => {
    const server = { serverId: 'tools', label: 'Tools', enabled: true, transport: { type: 'http', url: 'https://mcp.example.test', headers: { Authorization: 'raw-secret' } } };
    expect(() => parseImportedMcpSnippet(JSON.stringify(server))).toThrow();
    expect(() => parseImportedMcpSnippet(JSON.stringify({ ...server, protocol: 'legacy' }))).toThrow();
    expect(() => parseImportedMcpSnippet('{')).toThrow();
  });
});
