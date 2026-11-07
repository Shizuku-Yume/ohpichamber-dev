import { create } from 'zustand';
import type { CleanseProgressEvent, CleanseProgressStatus } from '@openchamber/agent-contract';
import { compareCounters } from '@/sync/event-reducer';

interface CleanseState {
  sessionId: string;
  epoch: string;
  sequence: string;
  status: CleanseProgressStatus;
  activeCheckers: string[];
  completedCheckers: string[];
  repairedFiles: string[];
  diagnosticsCount?: number;
  summary?: string;
  updatedAt: number;
}

const VALID_CLEANSE_STATUSES: Record<CleanseProgressStatus, true> = {
  discovering: true,
  repairing: true,
  verifying: true,
  completed: true,
  failed: true,
  cancelled: true,
};

type CleanseStore = {
  bySession: Record<string, CleanseState>;
  applyCleanseProgress: (sessionId: string, event: CleanseProgressEvent) => void;
  clearSessionCleanse: (sessionId: string) => void;
  reset: () => void;
};

export const useCleanseStore = create<CleanseStore>()((set) => ({
  bySession: {},
  applyCleanseProgress: (sessionId, event) =>
    set((state) => {
      if (!VALID_CLEANSE_STATUSES[event.status]) return state;
      const existing = state.bySession[sessionId];
      if (existing) {
        const eventEpoch = event.epoch ?? '0';
        const existingEpoch = existing.epoch ?? '0';
        if (eventEpoch === existingEpoch) {
          if (event.sequence && existing.sequence && compareCounters(event.sequence, existing.sequence) < 0) {
            return state;
          }
        } else {
          const eventTime = event.timestamp ?? 0;
          if (eventTime && existing.updatedAt && eventTime < existing.updatedAt) {
            return state;
          }
        }
      }
      const updated: CleanseState = {
        sessionId,
        epoch: event.epoch ?? '0',
        sequence: event.sequence ?? '0',
        status: event.status,
        activeCheckers: [...event.activeCheckers],
        completedCheckers: [...event.completedCheckers],
        repairedFiles: [...event.repairedFiles],
        diagnosticsCount: event.diagnosticsCount,
        summary: event.summary,
        updatedAt: event.timestamp ?? Date.now(),
      };
      return {
        bySession: {
          ...state.bySession,
          [sessionId]: updated,
        },
      };
    }),
  clearSessionCleanse: (sessionId) =>
    set((state) => {
      if (!(sessionId in state.bySession)) return state;
      const bySession = { ...state.bySession };
      delete bySession[sessionId];
      return { bySession };
    }),
  reset: () => set({ bySession: {} }),
}));
