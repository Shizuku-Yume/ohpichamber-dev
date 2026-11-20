import React from 'react';
import { useBtwStore } from '@/stores/useBtwStore';

export type BtwPanelState = {
  collapsed: boolean;
  pending: boolean;
  ephemeralRecordId: string | null;
  ephemeralText: string;
  ephemeralStatus: 'idle' | 'running' | 'completed' | 'cancelled' | 'failed';
};

/** Read the parent session's in-memory BTW panel state. */
export function useBtwPanelState(parentSessionId: string | null | undefined): BtwPanelState {
  const uiState = useBtwStore(
    React.useCallback((state) => (parentSessionId ? state.byParent[parentSessionId] : undefined), [parentSessionId]),
  );
  return React.useMemo(() => ({
    collapsed: Boolean(uiState?.collapsed),
    pending: Boolean(uiState?.pending),
    ephemeralRecordId: uiState?.ephemeralRecordId ?? null,
    ephemeralText: uiState?.ephemeralText ?? '',
    ephemeralStatus: uiState?.ephemeralStatus ?? 'idle',
  }), [uiState]);
}

/** Extract content enclosed in <inject>...</inject> tags for steering. */
export function extractBtwInject(text: string): string | null {
  const match = /<inject>([\s\S]*?)<\/inject>/i.exec(text);
  return match && match[1]?.trim() ? match[1].trim() : null;
}
