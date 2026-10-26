# 16: Retire the Session Goals supervisor

**Effort:** omp-native-chat
**Task type:** feature
**Base commit:** 3999ddb0d59575a661c492fa50659e22a1fe8ba7

**Delivers:** OMP goal mode is the only goal loop. Every way of starting a goal outside the composer (fork-from-answer and plan implement "Run as goal", scheduled tasks with `goalEnabled`, CLI `session create|send|fork --goal`) starts an OMP goal, the sidebar glyph and notifications follow the OMP goal, and the Host supervisor with its audit model is gone.

**Blocked by:** 09
**Files:** remove `packages/web/server/lib/session-goal/` (runtime, audit, objectives, routes and their tests) and its wiring in `packages/web/server/index.js` (`createSessionGoalRuntime`, `notifyGoalChanged`, `processCanonicalEvent`, `emitGoalNotification`), `lib/host/feature-routes-runtime.js` and `lib/host/shutdown-runtime.js`; keep the objective-fitting and goal-intro helpers from `create.js` only if a caller still needs them, moved next to that caller. `packages/web/server/lib/scheduled-tasks/runtime.js`, the orchestration route behind `packages/web/bin/lib/commands-session.js` and `cli-goal.js`, the notifications runtime, `packages/ui/src/components/session/ForkSessionDialog.tsx`, `packages/ui/src/components/views/PlanView.tsx`, `packages/ui/src/components/session/sidebar/sessions/SessionNodeItem.tsx`, `packages/ui/src/apps/MobileSessionsSheet.tsx` and `MobileSessionStateBadges.tsx`, `packages/ui/src/lib/sessionGoalMetadata.ts`, `sessionGoalActions.ts`, `sessionGoalPresentation.ts`, `sessionGoalTurnLimit.ts`, `packages/ui/src/components/sections/openchamber/SessionGoalCheckerField.tsx` and its settings registry entries, `packages/docs/content/docs/session-goals.mdx`, i18n.

**Read first:** spec "Goal entry points", "What it must not do" and W17; `packages/web/server/lib/session-goal/DOCUMENTATION.md` (every entry point and the notification rules it implements); `scope.md` SCOPE-10.2.
**Covers:** W17

## Progress
- Dirty at start: none
- Started: 2026-10-26T10:53:19+08:00
- Status: active
- Check before: pending; prerequisite task 09 is archived and landed.

**Check:** Before: `rg -l "session-goal/" packages/web/server` lists `index.js`, `feature-routes-runtime.js` and `scheduled-tasks/runtime.js`. After: it lists nothing, `GET /api/goals/objective/<id>` returns 404, and `rg "openchamber\.goal" packages/web packages/ui/src` finds no writer. `bun run --cwd packages/web test` has: a scheduled task with `goalEnabled` and a CLI `session create --prompt <p> --goal` each yield a session whose snapshot is `{kind:'goal', status:'active'}` with the expected objective and a following `origin:'goal'` run; with a goal active, a terminal run sends no ready notification, and a goal reaching `complete` sends exactly one. UI tests: fork-from-answer and plan implement with "Run as goal" send `goal create` with the dialog's objective after the session exists and before its first prompt; the sidebar glyph colours by `SessionMode` goal status.

- [ ] No Host code prompts a session on a goal's behalf; continuation comes only from OMP.
- [ ] The goal is created before the first prompt is dispatched, so OMP starts the first goal turn and the objective is never sent twice.
- [ ] The default token budget setting still applies to every entry point; the evaluation-model setting and its copy are removed.
- [ ] Stored `metadata.openchamber.goal` on existing sessions is ignored, not migrated.
- [ ] `session-goals.mdx` describes OMP goal behaviour: the agent declares completion, budget and no-progress stops, no independent auditor.
- [ ] `scope.md` SCOPE-10.2 matches what shipped.
