import { create } from 'zustand';

interface SessionGoalArmStore {
  armed: boolean;
  objectiveOverride: string | null;
  composerGoal: boolean;
  setArmed: (armed: boolean, objectiveOverride?: string | null, composerGoal?: boolean) => void;
  consume: () => { armed: boolean; objectiveOverride: string | null; composerGoal: boolean };
}

export const useSessionGoalArmStore = create<SessionGoalArmStore>((set, get) => ({
  armed: false,
  objectiveOverride: null,
  composerGoal: false,
  setArmed: (armed, objectiveOverride = null, composerGoal = false) => set({
    armed,
    objectiveOverride: armed ? objectiveOverride : null,
    composerGoal: armed && composerGoal,
  }),
  consume: () => {
    const { armed, objectiveOverride, composerGoal } = get();
    if (armed) set({ armed: false, objectiveOverride: null, composerGoal: false });
    return { armed, objectiveOverride, composerGoal };
  },
}));
