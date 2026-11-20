import React from 'react';

import { useUIStore } from '@/stores/useUIStore';
import { selectWorkflowsShown } from '@/lib/workflows/availability';
import type { WorkStatusSectionId } from './sections';

export const useUnavailableWorkStatusSections = (): readonly WorkStatusSectionId[] => {
  const workflows = useUIStore(selectWorkflowsShown);
  const isMobile = useUIStore((state) => state.isMobile);
  return React.useMemo(() => [
    ...(isMobile ? ['usage' as const] : []),
    ...(workflows ? [] : ['workflows' as const]),
  ], [isMobile, workflows]);
};
