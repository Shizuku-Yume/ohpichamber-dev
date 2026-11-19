import { create } from 'zustand';

<<<<<<< HEAD
// The composer consumes this flag on submit to create a goal directly; the
// server starts goal execution, so the submitted objective is not sent as a prompt.
||||||| bc50ba56aa
// Narrow store for the "next message starts a goal" flag. Armed by the
// composer target button (works for existing sessions AND session drafts)
// and by the run-as-goal flows (fork dialog, plan send); consumed by
// sendMessage in session-ui-store, which turns the sent prompt into the
// goal objective — unless the arming flow supplied a richer objective
// override (e.g. the plan content instead of "Implement this plan: X").
=======
>>>>>>> upstream/main
interface SessionGoalArmStore {
  armed: boolean;
  objectiveOverride: string | null;
<<<<<<< HEAD
  composerGoal: boolean;
  setArmed: (armed: boolean, objectiveOverride?: string | null, composerGoal?: boolean) => void;
  consume: () => { armed: boolean; objectiveOverride: string | null; composerGoal: boolean };
||||||| bc50ba56aa
  setArmed: (armed: boolean, objectiveOverride?: string | null) => void;
  /** Read-and-clear in one step at send time. */
  consume: () => { armed: boolean; objectiveOverride: string | null };
=======
  setArmed: (armed: boolean, objectiveOverride?: string | null) => void;
  consume: () => { armed: boolean; objectiveOverride: string | null };
>>>>>>> upstream/main
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
