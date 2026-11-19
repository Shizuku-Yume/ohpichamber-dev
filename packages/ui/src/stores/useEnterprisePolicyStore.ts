<<<<<<< HEAD
/**
 * Projection of the enterprise policy the connected runtime enforces
 * (`packages/web/server/lib/enterprise-mode.js`). The OpenChamber host is
 * authoritative and refuses
 * what the policy forbids; this store only lets Settings hide those ways in
 * and say who decided. Nothing here is persisted.
 */
||||||| bc50ba56aa
/**
 * Projection of the enterprise policy the connected runtime enforces
 * (`packages/web/server/lib/enterprise-mode.js`, read by the web server and by
 * the VS Code extension host alike). The runtime is authoritative and refuses
 * what the policy forbids; this store only lets Settings hide those ways in
 * and say who decided. Nothing here is persisted.
 */
=======
>>>>>>> upstream/main
import { z } from 'zod';
import { create } from 'zustand';

import { runtimeFetch } from '@/lib/runtime-fetch';
import { useRoutingStore } from '@/stores/useRoutingStore';

const enterprisePolicySchema = z.object({
  enterpriseMode: z.boolean(),
  source: z.enum(['policy-file', 'environment']).nullable(),
  organization: z.string().min(1).nullable(),
  policyError: z.string().min(1).nullable(),
  networkAccessBlocked: z.boolean().default(false),
<<<<<<< HEAD
||||||| bc50ba56aa
  // OpenCode CLI path the administrator pinned; servers from before the pin have none.
  opencodeBinary: z.string().min(1).nullable().default(null),
=======
  opencodeBinary: z.string().min(1).nullable().default(null),
>>>>>>> upstream/main
});

type EnterprisePolicy = z.infer<typeof enterprisePolicySchema>;

const NO_POLICY: EnterprisePolicy = {
  enterpriseMode: false,
  source: null,
  organization: null,
  policyError: null,
  networkAccessBlocked: false,
};

const fetchEnterprisePolicy = async (): Promise<EnterprisePolicy | null> => {
  const response = await runtimeFetch('/api/openchamber/enterprise-policy');
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Enterprise policy request failed (${response.status})`);
  return enterprisePolicySchema.parse(await response.json());
};

interface EnterprisePolicyStoreState extends EnterprisePolicy {
  load: () => Promise<void>;
  resetForRuntime: () => void;
}

let loadGeneration = 0;

export const useEnterprisePolicyStore = create<EnterprisePolicyStoreState>()((set) => ({
  ...NO_POLICY,

  load: async () => {
    const generation = ++loadGeneration;
    try {
      const policy = await fetchEnterprisePolicy();
      if (generation !== loadGeneration) return;
      set(policy ?? NO_POLICY);
    } catch (error) {
      console.warn('[enterprise] policy read failed:', error instanceof Error ? error.message : error);
    }
  },

  resetForRuntime: () => {
    loadGeneration += 1;
    set(NO_POLICY);
  },
}));

export const useJevBlockedByEnterprise = (): boolean => {
  const enterpriseMode = useEnterpriseMode();
  const jevAvailable = useRoutingStore((state) => state.jevAvailable);
  return enterpriseMode && !jevAvailable;
};

export const useEnterpriseMode = (): boolean => {
  const fromPolicy = useEnterprisePolicyStore((state) => state.enterpriseMode);
  const fromRouting = useRoutingStore((state) => state.enterpriseMode);
  return fromPolicy || fromRouting;
};
