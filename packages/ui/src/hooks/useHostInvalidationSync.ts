import { useGuestMarksSync } from '@/hooks/useGuestMarksSync';
import { useQuotaProviderSync } from '@/hooks/useQuotaProviderSync';

export const useHostInvalidationSync = (): void => {
  useGuestMarksSync();
  useQuotaProviderSync();
};
