import type { SourceControlAPI } from '@/lib/api/types';

import { useBrowserProviderSync } from '@/hooks/useBrowserProviderSync';
import { useSourceControlProviderSync } from '@/hooks/useSourceControlProviderSync';

export const useProviderSyncs = (
  sourceControl: Pick<SourceControlAPI, 'providers' | 'authInstances' | 'authStatus'>,
): void => {
  useBrowserProviderSync();
  useSourceControlProviderSync(sourceControl);
};
