import { toast } from 'sonner';
import { z } from 'zod';
import type { JsonObject, MCPApplyResult, MCPServerConfig } from '@openchamber/agent-contract';
import { formatMessage, useI18nStore, type I18nKey } from '@/lib/i18n';

const TOAST_ID = 'mcp-credential-reentry';

const credentialReentryDetailsSchema = z.object({
  servers: z.array(z.string().min(1)).min(1),
});

const displayNames = (serverIds: string[], servers: MCPServerConfig[]): string[] =>
  serverIds.map((serverId) =>
    servers.find((server) => server.serverId === serverId)?.label ?? serverId);

const reentryMessage = (names: string[], single: I18nKey, plural: I18nKey): string =>
  formatMessage(useI18nStore.getState().dictionary, names.length === 1 ? single : plural, { servers: names.join(', ') });

export const notifyMcpCredentialReentry = (result: MCPApplyResult): void => {
  const entries = result.needsCredentialReentry;
  if (!entries || entries.length === 0) return;
  const message = reentryMessage(
    displayNames(entries, result.configuration.config.servers),
    'settings.mcp.page.toast.credentialReentrySingle',
    'settings.mcp.page.toast.credentialReentryPlural',
  );
  toast.warning(message, { id: TOAST_ID });
};

export const describeMcpCredentialReentryRefusal = (problemDetails: JsonObject | undefined, servers: MCPServerConfig[]): string | undefined => {
  const parsed = credentialReentryDetailsSchema.safeParse(problemDetails);
  if (!parsed.success) return undefined;
  return reentryMessage(
    displayNames(parsed.data.servers, servers),
    'settings.mcp.page.toast.credentialReentryRefusedSingle',
    'settings.mcp.page.toast.credentialReentryRefusedPlural',
  );
};
