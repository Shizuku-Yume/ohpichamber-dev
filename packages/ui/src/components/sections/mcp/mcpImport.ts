import { MCPServerConfigSchema, type MCPServerConfig } from '@openchamber/agent-contract';

/** Imports the canonical server record, rejecting secrets and obsolete engine options. */
export function parseImportedMcpSnippet(source: string): MCPServerConfig {
  return MCPServerConfigSchema.parse(JSON.parse(source));
}
