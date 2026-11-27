import type { TrackerAPI } from '@/lib/api/types';

import { useGuestMarksSync } from '@/hooks/useGuestMarksSync';
import { useQuotaProviderSync } from '@/hooks/useQuotaProviderSync';
import { useTrackerProviderSync } from '@/hooks/useTrackerProviderSync';

export const useHostInvalidationSync = ({ trackers }: { trackers: TrackerAPI | undefined }): void => {
  useGuestMarksSync();
  useQuotaProviderSync();
  useTrackerProviderSync(trackers);
};
