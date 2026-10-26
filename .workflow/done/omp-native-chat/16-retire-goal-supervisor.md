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
 - Check before: not run; previous handoff contains no executable result.
 - Check after: focused W17 suites pass: scheduled/runtime + issue2710 + notifications + CLI 58/58; UI fork/plan and agent-contract 29/29; notification + CLI 16/16; web metadata/status 9/9. Web lint passed. Web type-check remains blocked by stale locale keys outside goal changes; dead-code reports pre-existing unrelated entries; full UI suite has unrelated failures.
 - Completed: Host supervisor files/routes/wiring removed; composer, fork, plan, scheduled task and CLI native-goal entry points; supervisor-only evaluator/checker/max-turn UI/settings/i18n retired; legacy Host goal metadata ignored; goal and OMP-mode docs updated.
 - Review boundary: base `3999ddb0d59575a661c492fa50659e22a1fe8ba7` + task16 paths, briefs A/B/sec; fallback reviewer used; security 0 blocking / 0 nonblocking. Brief A evidence gap addressed by focused receipts and real-path limitation. Brief B fixed CLI selection forwarding, plan worktree selection, and post-settlement ordinary ready alerts.
 - Real path: HMR UI loaded/authenticated; goal submitted created session `021513a9-3f9c-47fc-8d4f-e89a03d4c287`, then UI `Sync hooks require SyncProvider` and canonical 503 `SESSION_RESTORE_FAILED`; worker logs confirm restore failure. Provider env present via fish. Receipt: `/home/shizuku/Project/ohpichamber-omp-artifacts/omp-native-chat-16-2026-10-25/real-path.txt` and `real-path-error.png`.
 - Remaining checks: full W15/W16 are flow-close scope per COMMON; focused task Check completed. Type-check locale failures and unrelated full-suite failures are documented limitations.
 - Findings: no security findings; no task-specific debt.
 - Finished: 2026-10-26T15:30:00+08:00
**Check:** Before: prior handoff had no executable result. After: focused W17 suites above; objective route absent and goal metadata writer absent in scoped packages.

 - [x] No Host code prompts a session on a goal's behalf; continuation comes only from OMP.
 - [x] The goal is created before the first prompt is dispatched, so OMP starts the first goal turn and the objective is never sent twice.
 - [x] The default token budget setting still applies to every entry point; the evaluation-model setting and its copy are removed.
 - [x] Stored `metadata.openchamber.goal` on existing sessions is ignored, not migrated.
 - [x] `session-goals.mdx` describes OMP goal behaviour: the agent declares completion, budget and no-progress stops, no independent auditor.
 - [x] `scope.md` SCOPE-10.2 matches what shipped.
