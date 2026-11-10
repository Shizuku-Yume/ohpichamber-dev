# 16: Resolve the merge in the workbench shell, sidebar and mobile apps

**Effort:** ux-v270-omp-alignment
**Blocked by:** 11
**Covers:** W1, W2
**Files:** `packages/ui/src/components/{session,layout,views,multirun,overview,projects,update,desktop,onboarding,sourceBoard,references}/**`; `packages/ui/src/apps/**`; `packages/ui/src/App.tsx`; any `packages/ui/**` path not owned by lanes 13-15 or 17
**Read first:** spec "How it is built" (Merge); `merge-lanes.tsv` lane 16; skills `ui-api-decoupling`, `drag-to-reorder`, `locale-ui-patterns`
**Check:** in a worktree on the scaffold branch, `bun scripts/upstream-drift.mjs --markers --lane 16` → 0; `bun run --cwd packages/ui type-check` reports no error in lane paths; `bun scripts/upstream-drift.mjs --check` on lane paths → 0 `unexplained`
- **Base commit:** fd671d0690c72c3f69b8c8c3739f60ce026832d8

- [x] Resolve the conflicted paths with the merge rule. Adopt upstream's `SidebarHeader` order and menus (sections manager, mark all read, worktree name by branch, row context menus, worktree icon), `ContextSurfacePanes`, Files preview failure states, knowledge panes, the update dialog with release notes and progress, and the mobile walkthrough/connections surfaces.
- [x] Restore silently deleted upstream workbench files unless a decision retires them.
- [x] Deletes: the fork's rewritten sidebar header and other unexplained rewrites in lane paths.

## Progress

**Partition.** The lane is resolved by four workers in this worktree. `v270-16-layout` owns `components/layout/**`, `v270-16-session` owns `components/session/**`, `v270-16-views` owns `components/views/**`. This worker owns everything else in lane 16: `apps/**`, `App.tsx`, `components/{multirun,overview,projects,update,desktop,onboarding,sourceBoard,references,ui,auth,comments,dictation,icon,inline-picker,mcp,mini-chat,snippets,usage}/**`, and every other lane-16 path outside the three partitions. Integration (markers → 0, lane-scoped type-check, `--check` → 0 unexplained, reviewer, landing) runs here after the partitions land.

**Check before:** `bun scripts/upstream-drift.mjs --markers --lane 16` → 1926 conflict-marker lines across 178 files (exit 1). `bun run --cwd packages/ui type-check` → 7,080 errors in 425 files (exit 1); `bun check --all` attributes 2,683 error blocks to lane paths. `bun scripts/upstream-drift.mjs --check --lane 16` → 97 `unexplained` lane paths.

**Check after:** `bun scripts/upstream-drift.mjs --markers --lane 16` → 0 marker lines across 0 files. `bun scripts/upstream-drift.mjs --check --lane 16` → `drift check passed: no conflict markers, no unexplained path, no contradicting row (base bc50ba5)`; `unexplained` 97 → 0 and `contradicting row` 14 → 0 once the landing target's lane-13 rows were merged in. `bunx oxlint` on all 194 existing lane-16 `.ts`/`.tsx` paths → 0 errors (the remaining `react-hooks/exhaustive-deps` warnings are pre-existing). `bun run --cwd packages/ui type-check` → 4 error blocks in 1 file, all lane 14's `components/model-picker/ModelPickerList.tsx` conflict markers; 0 errors in any lane-16 path. Lane-16 tests: 6 files pass (32 tests), 43 files remain blocked by lanes 12/14 conflict markers, 0 genuine failures.

**Retired in this lane** (upstream-only, no consumer in the merge target): `apps/VSCodeApp.tsx`, `apps/renderVSCodeApp.tsx`, `apps/vscodeSessionNavigation.ts`, `components/projects/OpenCodeTrustDialog.tsx`, `components/ui/ConfigUpdateOverlay.tsx`, `components/ui/OpenCodeHeapSnapshot.tsx`, `components/ui/OpenCodeStatusDialog.tsx`, `components/update/OpenCodeCompatibilityGate.{tsx,test.tsx}`, `components/update/OpenCodeUpdateToast.tsx`, `components/update/openCodeUpgrade.ts`, `components/update/openCodeUpdateDedup.ts`, `components/update/openCodeCompatibilityCheck.ts`, `components/multirun/AgentSelector.tsx`, `components/session/spaces/{SpaceStatus,SpacePreparing,SpaceChatPlaceholder,DockerSetupNotice}.tsx`.

**Seam repairs this worker made after the three partitions landed:** `lib/desktop.ts` (duplicate `takePendingDesktopExtensionInstalls`/`getDesktopWindowVisibility` removed, fork `installBlocked` kept), `lib/modelVariants.ts` (the committed `@theirs` marker resolved; `ModelVariantSource` exported), `lib/i18n/index.ts` (`getInlineStartSide` restored to the barrel), `lib/diffCommentOrigin.ts` (target-aware `provider`), `apps/AppEffects.tsx` (server-owned queue kept), `apps/MobileApp.tsx` (tab contract, then the review's Settings bridge, browser Back, per-session file scoping and memory sync restored), `apps/mobileSidebar/{MobileWorkRows,MobileSessionRow,MobileSessionList,mobileSessionActions}.tsx`, `components/session/sidebar/**` (contract shapes, duplicate declarations, `parentSessionId` lineage), `components/{ForkSessionDialog,ReviewFlowDialog,TodoSendDialog}.tsx` (no agent `mode`), `components/multirun/{ModelMultiSelect,ModelEffortMenu}.tsx` (canonical `providerId`/`modelId`), `components/sourceBoard/**` (outside-lookup gate, preview repository, linked read guard, waiting-merge cancel), `App.tsx` and `apps/runtimeEndpointReset.ts` (auto-review projection is server-owned; `resetForRuntimeSwitch`).

**The lane's real shape (measured on this tree):**

- 178 conflicted files. The blob ledger classes 84 `omp-boundary` and 94 `unexplained`, but the class is per path, not per hunk: 132 of the 642 conflicting hunks carry fork text with no boundary token.
- Both sides changed every file: only 1 of 178 has an import-only upstream delta, and 79 carry fork rewrites of 100+ changed lines. This is per-file authorship, not a marker sweep.
- 79 upstream sides import modules the fork deleted: `@/lib/opencode/model` (49), `@/lib/opencode/client` (17), `@/lib/spaces/*`, `@/components/session/spaces/*`, `vscodeBootstrap`, `opencodeTrust`, `serverCompatibility`, `ConfigUpdateOverlay`, `useSourceControlProviderSync`, `useSessionWarmingStore`, `sessionBtwMetadata`, `pending-session-assists`, `openCodeUpgrade`/`openCodeCompatibilityCheck`.
- Import swaps are not mechanical: the contract `Session` is `sessionId`/`displayPath`/`parentSessionId`/`createdAt`+`updatedAt`/`archiveRevision`, upstream's model is `id`/`directory`/`parentID`/`time.created`+`time.updated`/`time.archived`; `Message` and `Part` differ too. Fork replacements: `@openchamber/agent-contract`, `@/lib/api`, `hostFilesystem`, `@/lib/runtime-switch`.
- 43 upstream-only files in lane paths: 33 have no retired-module import, 12 have a live consumer, 13 are referenced only by retired surfaces or nothing, and 7 are the upstream OpenCode update gate that this lane retires.
