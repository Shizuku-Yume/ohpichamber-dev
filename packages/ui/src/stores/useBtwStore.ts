import { create } from 'zustand';

type BtwPanelUIState = {
  collapsed?: boolean;
  pending?: boolean;
  pendingSend?: symbol;
  ephemeralRecordId?: string;
  ephemeralText?: string;
  ephemeralStatus?: 'idle' | 'running' | 'completed' | 'cancelled' | 'failed';
};

type BtwStore = {
  byParent: Record<string, BtwPanelUIState>;
  setPanelState: (parentSessionId: string, patch: BtwPanelUIState) => void;
  clearPanelState: (parentSessionId: string) => void;
  applyEphemeralDelta: (parentSessionId: string, recordId: string, delta: string) => void;
  completeEphemeral: (parentSessionId: string, recordId: string, status: BtwPanelUIState['ephemeralStatus'], text: string) => void;
};

export const useBtwStore = create<BtwStore>()((set) => ({
  byParent: {},
  setPanelState: (parentSessionId, patch) =>
    set((state) => ({
      byParent: {
        ...state.byParent,
        [parentSessionId]: { ...state.byParent[parentSessionId], ...patch },
      },
    })),
  clearPanelState: (parentSessionId) =>
    set((state) => {
      if (!(parentSessionId in state.byParent)) return state;
      const byParent = { ...state.byParent };
      delete byParent[parentSessionId];
      return { byParent };
    }),
  applyEphemeralDelta: (parentSessionId, recordId, delta) => set(state => ({ byParent: { ...state.byParent, [parentSessionId]: { ...state.byParent[parentSessionId], ephemeralRecordId: recordId, ephemeralText: `${state.byParent[parentSessionId]?.ephemeralText ?? ''}${delta}`, ephemeralStatus: 'running' } } })),
  completeEphemeral: (parentSessionId, recordId, status, text) => set(state => ({ byParent: { ...state.byParent, [parentSessionId]: { ...state.byParent[parentSessionId], ephemeralRecordId: recordId, ephemeralText: text, ephemeralStatus: status } } })),
}));
