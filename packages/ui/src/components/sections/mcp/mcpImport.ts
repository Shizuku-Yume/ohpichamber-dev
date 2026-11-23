import { MCPServerConfigSchema, MCPTransportSchema, type MCPServerConfig } from '@openchamber/agent-contract';
import { z } from 'zod';

export const normalizeEnvKey = (value: string): string => value.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
export const normalizeHeaderKey = (value: string): string => value.replace(/[^!#$%&'*+.^_`|~0-9A-Za-z-]/g, '');

export class McpImportError extends Error {
  constructor(public readonly code: 'invalid' | 'multiple' | 'transport' | 'expression' | 'duplicateHeaders' | 'unsupportedKey', public readonly key?: string) {
    super(code === 'expression' ? `Unsupported credential expression: ${key}` : code === 'multiple' ? 'Import one server at a time.' : 'Invalid MCP import.');
  }
}

const EntrySchema = z.object({
  type: z.string().optional(), command: z.string().optional(), args: z.array(z.string()).optional(),
  url: z.string().optional(), env: z.record(z.string(), z.string()).optional(),
  headers: z.record(z.string(), z.string()).optional(), enabled: z.boolean().optional(),
  disabled: z.boolean().optional(), name: z.string().optional(),
}).catchall(z.json());
const SnippetSchema = z.object({ mcpServers: z.record(z.string(), z.json()) });
const represented = new Set(['type', 'command', 'args', 'env', 'url', 'headers', 'enabled', 'disabled', 'name']);
const safeKey = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

export function parseImportedMcpSnippet(source: string): {
  server: MCPServerConfig;
  credentials: Array<{ key: string; value: string }>;
  droppedFields: string[];
} {
  let input;
  try { input = JSON.parse(source); } catch { throw new McpImportError('invalid'); }
  const canonical = MCPServerConfigSchema.safeParse(input);
  if (canonical.success) return { server: canonical.data, credentials: [], droppedFields: [] };
  const parsed = SnippetSchema.safeParse(input);
  if (!parsed.success) throw new McpImportError('invalid');
  const entries = Object.entries(parsed.data.mcpServers);
  if (entries.length > 1) throw new McpImportError('multiple');
  const first = entries[0];
  if (!first) throw new McpImportError('invalid');
  const [name, rawEntry] = first;
  const parsedEntry = EntrySchema.safeParse(rawEntry);
  if (!parsedEntry.success) throw new McpImportError('invalid');
  const entry = parsedEntry.data;
  if ((entry.command !== undefined) === (entry.url !== undefined)) throw new McpImportError('transport');
  const stdio = entry.command !== undefined;
  if (stdio ? entry.type !== undefined && entry.type !== 'stdio' : entry.type !== undefined && !['http', 'streamable-http', 'sse'].includes(entry.type)) throw new McpImportError('transport');
  const transport = MCPTransportSchema.safeParse(stdio
    ? { type: 'stdio', command: entry.command, args: entry.args ?? [] }
    : { type: entry.type === 'sse' ? 'sse' : 'http', url: entry.url });
  if (!transport.success) throw new McpImportError('transport');
  if (!stdio && entry.headers) {
    const names = Object.keys(entry.headers).map(name => name.toLowerCase());
    if (new Set(names).size !== names.length) throw new McpImportError('duplicateHeaders');
  }
  const credentials = Object.entries((stdio ? entry.env : entry.headers) ?? {}).map(([key, value]) => {
    const normalized = stdio ? normalizeEnvKey(key) : normalizeHeaderKey(key);
    if (!key.trim() || normalized !== key || !safeKey.test(key)) throw new McpImportError('unsupportedKey');
    if (value.includes('${') || value.startsWith('!')) throw new McpImportError('expression', key);
    return { key, value };
  });
  const droppedFields = Object.keys(entry).filter(key => !represented.has(key) || (stdio ? key === 'headers' : key === 'env' || key === 'args'));
  if (droppedFields.some(key => !safeKey.test(key))) throw new McpImportError('invalid');
  const server = MCPServerConfigSchema.safeParse({ serverId: 'imported-mcp', label: name, enabled: entry.enabled !== false && entry.disabled !== true, transport: transport.data });
  if (!server.success) throw new McpImportError('invalid');
  return { server: server.data, credentials, droppedFields };
}
