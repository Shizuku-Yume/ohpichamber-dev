import { create } from 'zustand';

interface SessionGoalArmStore {
  armed: boolean;
  objectiveOverride: string | null;
  tokenBudgetOverride: number | null;
  composerGoal: boolean;
  setArmed: (armed: boolean, objectiveOverride?: string | null, composerGoal?: boolean, tokenBudgetOverride?: number | null) => void;
  consume: () => { armed: boolean; objectiveOverride: string | null; tokenBudgetOverride: number | null; composerGoal: boolean };
}

export const useSessionGoalArmStore = create<SessionGoalArmStore>((set, get) => ({
  armed: false,
  objectiveOverride: null,
  tokenBudgetOverride: null,
  composerGoal: false,
  setArmed: (armed, objectiveOverride = null, composerGoal = false, tokenBudgetOverride = null) => set({
    armed,
    objectiveOverride: armed ? objectiveOverride : null,
    composerGoal: armed && composerGoal,
    tokenBudgetOverride: armed ? tokenBudgetOverride : null,
  }),
  consume: () => {
    const { armed, objectiveOverride, tokenBudgetOverride, composerGoal } = get();
    if (armed) set({ armed: false, objectiveOverride: null, tokenBudgetOverride: null, composerGoal: false });
    return { armed, objectiveOverride, tokenBudgetOverride, composerGoal };
  },
}));
