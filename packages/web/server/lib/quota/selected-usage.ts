import type { createCatalogCredentialSelections, createSelectedCredentialResolver } from '../host/private-credential.js';
import { z } from 'zod';
import { SELECTED_CREDENTIAL_UNAVAILABLE } from './providers/selected-credential.js';
import type { ReadNativeReports } from './native.js';

type Quota = typeof import('./index.js');
type Selections = ReturnType<typeof createCatalogCredentialSelections>;
type Scope = { workspaceId: string; agentDirectoryId?: string | undefined };

export const createSelectedUsageQuota = ({ loadQuota, listQuotaSelections, resolveQuotaSelection, resolveCredential, readNativeReports }: Pick<Selections, 'listQuotaSelections' | 'resolveQuotaSelection'> & {
  loadQuota: () => Promise<Quota>;
  resolveCredential: ReturnType<typeof createSelectedCredentialResolver>;
  readNativeReports?: ReadNativeReports;
}) => async (scope: Scope) => {
  const quota = await loadQuota();
  const query = scope.agentDirectoryId
    ? { workspaceId: scope.workspaceId, agentDirectoryId: scope.agentDirectoryId }
    : { workspaceId: scope.workspaceId };
  const request = { query };
  return {
    listUsagePageProviders: quota.listUsagePageProviders,
    listConfiguredQuotaProviders: async () => quota.listConfiguredQuotaProviders({ selections: await listQuotaSelections(request) }),
    fetchQuotaForProvider: async (providerId: string) => {
      let selection;
      try { selection = await resolveQuotaSelection(request, providerId); }
      catch (error) {
        if (z.object({ code: z.literal(SELECTED_CREDENTIAL_UNAVAILABLE) }).safeParse(error).success) {
          const unconfigured = quota.buildUnconfiguredQuotaResult(providerId);
          if (unconfigured) return unconfigured;
        }
        throw error;
      }
      return quota.fetchQuotaForProvider(providerId, { ...selection, resolveCredential, readNativeReports });
    },
  };
};
