<<<<<<< HEAD
/** Bounds for the goal turn cap, shared by the settings field and the worker env capture. */
||||||| bc50ba56aa
/**
 * How many automatic turns a goal may take before it stops for the user. The
 * server applies the same bounds (`session-goal/runtime.js`).
 */
=======
>>>>>>> upstream/main
export const DEFAULT_SESSION_GOAL_MAX_AUTO_TURNS = 20;
export const SESSION_GOAL_MAX_AUTO_TURNS_LIMIT = 200;

export type SessionGoalChecker = 'classifier' | 'small-model';
