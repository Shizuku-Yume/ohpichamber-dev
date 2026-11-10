# 16: Resolve the merge in the workbench shell, sidebar and mobile apps

**Effort:** ux-v270-omp-alignment
**Blocked by:** 11
**Covers:** W1, W2
**Files:** `packages/ui/src/components/{session,layout,views,multirun,overview,projects,update,desktop,onboarding,sourceBoard,references}/**`; `packages/ui/src/apps/**`; `packages/ui/src/App.tsx`; any `packages/ui/**` path not owned by lanes 13-15 or 17
**Read first:** spec "How it is built" (Merge); `merge-lanes.tsv` lane 16; skills `ui-api-decoupling`, `drag-to-reorder`, `locale-ui-patterns`
**Check:** in a worktree on the scaffold branch, `bun scripts/upstream-drift.mjs --markers --lane 16` → 0; `bun run --cwd packages/ui type-check` reports no error in lane paths; `bun scripts/upstream-drift.mjs --check` on lane paths → 0 `unexplained`
- **Base commit:** fd671d0690c72c3f69b8c8c3739f60ce026832d8
- **Status:** blocked

- [ ] Resolve the conflicted paths with the merge rule. Adopt upstream's `SidebarHeader` order and menus (sections manager, mark all read, worktree name by branch, row context menus, worktree icon), `ContextSurfacePanes`, Files preview failure states, knowledge panes, the update dialog with release notes and progress, and the mobile walkthrough/connections surfaces.
- [ ] Restore silently deleted upstream workbench files unless a decision retires them.
- [ ] Deletes: the fork's rewritten sidebar header and other unexplained rewrites in lane paths.

## Progress

**Check before:** `bun scripts/upstream-drift.mjs --markers --lane 16` → 1926 conflict-marker lines across 178 files (exit 1). `bun run --cwd packages/ui type-check` → 7,080 errors in 425 files (exit 1); `bun check --all` attributes 2,683 error blocks to lane paths (177 `TS1185` merge-marker errors plus the cascade). `bun scripts/upstream-drift.mjs --check --lane 16` → 97 `unexplained` lane paths.

**Check after:** unchanged from before. The tree is clean; nothing was committed. `bun scripts/upstream-drift.mjs --markers --lane 16` still reports 1926 markers across 178 files, and `bun run --cwd packages/ui type-check` still exits 1. No check was faked.

**What the lane actually contains (measured on this tree):**

- 178 conflicted files. The blob ledger (`.workflow/upstream-deltas.tsv` / `scripts/upstream-drift.mjs`) classes 84 `omp-boundary` and 94 `unexplained`, but that class is per path, not per hunk: 132 of the 642 conflicting hunks carry fork text with no boundary token, and several `omp-boundary` files are wholly OpenCode-shaped in their fork body rather than differing only at the boundary seam.
- Both sides changed every file. Only 1 of the 178 has an import-only upstream delta; 79 carry fork rewrites of more than 100 changed lines (up to 1,052 in `views/files/previews/TableArtifact.tsx`, 870 in `layout/Header.tsx`, 789 in `views/walkthrough/WalkthroughView.tsx`). This is not a marker sweep — each file needs upstream's body with the OMP seam re-expressed.
- 79 of the 178 upstream sides import modules the fork deleted and the merge must not restore: `@/lib/opencode/model` (49), `@/lib/opencode/client` (17), `@/lib/spaces/*`, `@/components/session/spaces/*`, `vscodeBootstrap`, `opencodeTrust`, `serverCompatibility`, `ConfigUpdateOverlay`, `useSourceControlProviderSync`, `useSessionWarmingStore`, `sessionBtwMetadata`, `pending-session-assists`, `openCodeUpgrade`/`openCodeCompatibilityCheck`.
- Adapting those imports is not mechanical. The contract's `Session` is `sessionId`/`displayPath`/`parentSessionId`/`createdAt`+`updatedAt`/`archiveRevision`, upstream's model is `id`/`directory`/`parentID`/`time.created`+`time.updated`/`time.archived`; `Message` and `Part` differ too. The fork's replacement modules are `@openchamber/agent-contract`, `@/lib/api`, `hostFilesystem`, `@/lib/runtime-switch`, and for `/btw` metadata `sessionWorkLineage` reading `metadata.openchamber` (main has no `sessionBtwMetadata` module).
- 43 upstream-only files sit in lane paths. 33 have no retired-module import and would restore, but only 12 have a live consumer; the rest serve VS Code/OpenCode surfaces the fork retired (`VSCodeLayout`, `renderVSCodeApp`, `vscodeSettingsNavigation`, `PluginPane.*.test.tsx`, `session/spaces/*`, `session/project-import/*`, `OpenCodeTrustDialog`). 13 of the 43 are referenced only by retired surfaces or by nothing at all.
- 7 of the 43 are the upstream OpenCode update gate (`OpenCodeCompatibilityGate` + test, `OpenCodeUpdateToast`, `openCodeCompatibilityCheck`, `openCodeUpgrade`, `openCodeUpdateDedup` + test). The fork has no OpenCode update path, so they retire; but `App.tsx`, `MobileApp.tsx` and `ElectronMiniChatApp.tsx` wire them today and those call sites must go with them.
- Whole-file substitutions were tried and rejected on evidence, not on time: taking upstream verbatim for the 94 `unexplained` paths leaves 449 syntax errors from seams that still point at deleted modules, and taking the fork body for the 84 `omp-boundary` paths leaves 5 files with markers inside them because upstream renamed the module (`ProjectActionsButton.test.tsx` → `HeaderProjectControls.test.tsx` with `<<<<<<< HEAD:...ProjectActionsButton.test.tsx` labels). Neither is a correct resolution.

## Blocked

Lane 16 is a per-file authorship task against a moving OMP boundary, not a marker sweep, and the run that started it ran out of its dependency budget before a correct tree existed. Nothing partial was committed: a half-resolved workbench tree cannot compile and must not land.

**Handoff — what the next run must do:**

1. For each of the 178 files take upstream's body, then rewrite only the seams to `@openchamber/agent-contract`, `@/lib/api`, `RuntimeAPIs`, `runtimeFetch`, `hostFilesystem` and `@/lib/runtime-switch`, translating `id`/`directory`/`parentID`/`time` to the contract's fields. Files whose whole fork body is an OpenCode shape — `layout/Header.tsx`, `layout/PluginPane.tsx`, `layout/SidebarFilesTree.tsx`, `layout/ContextSidebarTab.tsx`, `layout/ContextSurfacePanes.tsx`, `layout/ContextPanel*.tsx`, `apps/MobileChangesSurface.tsx`, `apps/MobileApp.tsx`, `views/FilesView.tsx`, `views/ArchiveView.tsx`, `views/GitView.tsx`, `views/TerminalView.tsx`, `views/PlanView.tsx`, `views/DiffView.tsx`, `session/DirectoryExplorerDialog.tsx`, `session/ScheduledTaskEditorDialog.tsx`, `session/ScheduledTasksDialog.tsx`, `session/sidebar/sessions/SessionNodeItem.tsx`, `session/sidebar/sessionSidebarRowModel.ts`, `session/sidebar/list/SessionProjectCollection.tsx`, `session/sidebar/projects/SessionGroupSection.tsx`, `session/sidebar/projects/useSessionGrouping.ts`, `session/sidebar/works/useWorktreeWork.ts`, `session/sidebar/works/sidebarWorks.ts`, `session/sidebar/list/sessionCollection.ts`, and the eight `session/project-context` panes — must not keep the fork rewrite just because the ledger says `omp-boundary`.
2. Adopt upstream's `SidebarHeader` order and menus (`SidebarHeader.tsx` is an `unexplained` fork rewrite: upstream adds the sections manager, "mark all read" as a mounted-on-open menu item, worktree name by branch, row context menus, worktree icon). Same for `ContextSurfacePanes`, the Files preview failure states, the knowledge panes, `ui/UpdateDialog.tsx` with release notes and progress (`releaseNotes.ts`, `ReleaseNotesBody.tsx`, `updateProgress.ts`), and the mobile walkthrough/connections surfaces.
3. Restore the 33 restorable upstream-only files and wire their consumers; retire the VS Code/OpenCode-trust/openCode-update files listed above and remove their `App`/`MobileApp`/`ElectronMiniChatApp` call sites with the fork's `OpenCodeUpdateToast`/`OpenCodeCompatibilityGate` imports.
4. The lane type-check cannot be read alone while sibling lanes hold markers: `bun run --cwd packages/ui type-check` is all-or-nothing and currently reports 7,080 errors across 425 files. Run it on the integration tree, or scope `bun check` to lane paths and discard errors that originate in lanes 13/15/17.
5. Then run `bun scripts/upstream-drift.mjs --check` for the lane and reconcile the remaining `unexplained` rows by class (`omp-boundary` or a `.workflow/upstream-deltas.tsv` decision row with the `2026-11-10 - Merge upstream OpenChamber with a real git merge` heading), so the ledger does not claim an unexplained state the resolution just fixed.
