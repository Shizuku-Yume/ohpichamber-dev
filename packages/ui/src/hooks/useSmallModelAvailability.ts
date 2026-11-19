import React from 'react';
import { selectSmallModelAvailability, useSmallModelStore, type SmallModelAvailability, type SmallModelAvailabilityScope } from '@/stores/useSmallModelStore';
import { useConfigStore } from '@/stores/useConfigStore';

<<<<<<< HEAD
/**
 * Whether the background model can run for `directory`. Fetches on mount and
 * whenever `active` flips to true (a menu opening, a dialog showing), so a
 * closed menu never polls.
 */
export function useSmallModelAvailability(directory: string | null | undefined, active = true, scope?: SmallModelAvailabilityScope): SmallModelAvailability {
  const currentProviderId = useConfigStore(state => state.currentProviderId);
  const currentModelId = useConfigStore(state => state.currentModelId);
  const providerId = scope?.preferred?.providerId ?? currentProviderId;
  const modelId = scope?.preferred?.modelId ?? currentModelId;
  const workspaceId = scope?.workspaceId;
  const effectiveScope = React.useMemo<SmallModelAvailabilityScope>(() => ({
    workspaceId,
    preferred: providerId && modelId ? { providerId, modelId } : undefined,
  }), [workspaceId, providerId, modelId]);
||||||| bc50ba56aa
/**
 * Whether the background model can run for `directory`. Fetches on mount and
 * whenever `active` flips to true (a menu opening, a dialog showing), so a
 * closed menu never polls.
 */
export function useSmallModelAvailability(directory: string | null | undefined, active = true): SmallModelAvailability {
=======
export function useSmallModelAvailability(directory: string | null | undefined, active = true): SmallModelAvailability {
>>>>>>> upstream/main
  const availability = useSmallModelStore(
    React.useCallback((state) => selectSmallModelAvailability(state, directory, effectiveScope), [directory, effectiveScope]),
  );
  const ensureFresh = useSmallModelStore((state) => state.ensureFresh);
  React.useEffect(() => {
    if (!active) return;
    void ensureFresh(directory, effectiveScope);
  }, [active, directory, ensureFresh, effectiveScope, currentProviderId, currentModelId]);
  return availability;
}
