# 32: Make the merged session sidebar and dialogs compile against the fork contracts

**Effort:** ux-v270-omp-alignment
**Task type:** bugfix
**Blocked by:** 30
**Covers:** W2
**Files:** `packages/ui/src/components/session/**`; their tests; slice 32 rows in `repair-slices.tsv`
**Read first:** spec "How it is built" (Merge); the archived task 16 record; `packages/ui/src/sync/DOCUMENTATION.md`; skills `ui-api-decoupling`, `sync-state-invariants`, `drag-to-reorder`, `openchamber-change-discipline`
**Check:** in your worktree, `bun check --all` → 0 errors in slice 32 files (about 257 errors in 50 files at scaffold `93a3c7549`, 215 of them under `session/sidebar`); `bun scripts/upstream-drift.mjs --check --slice 32` → 0 unexplained (37 `components/session` paths today); `VITEST_MAX_WORKERS=2 bunx vitest run packages/ui/src/components/session` → exit 0
- **Base commit:** f3afaa8d6504b5eb2f9a1fd8e7de4184ca551f31
- **Status:** active

- [ ] Fix every type error in slice 32 files by porting merged upstream callers onto the fork's Canonical Client, Host session authority and stores. Do not change exported shapes in `src/sync`, `src/stores` or `src/api` (slice 34 owns them); record any missing data in `## Progress` instead.
- [ ] Keep upstream v2.7.0's sidebar header order, menus, sections manager, mark-all-read, worktree naming and row context menus working on the fork's session model.
- [ ] Tests: fix tests for behaviour the merged code keeps; delete tests pinning retired OpenCode behaviour (named in `## Progress`).
- [ ] Give every slice 32 `unexplained` path a reason (adopt upstream or cite a decision).
- [ ] Deletes: imports of removed OpenCode modules and their dead branches.

## Progress

**Check before:** `bun check --all --no-pretty` (whole repo) → exit 1, 1,130 error blocks / 1,591 output lines; filtered by the 85 slice-32 paths from `repair-slices.tsv` → **257 error blocks in 50 files** (matches the task's scaffold number). `bun scripts/upstream-drift.mjs --check --slice 32` → no conflict markers, **37 unexplained paths** (609 unexplained outside the slice, unchecked).

**Check after (partial, this run):** same whole-repo `bun check --all` filtered to slice 32 paths → **202 error blocks in 47 files** (repo total 1,075). Drift check still 37 unexplained; **vitest for `packages/ui/src/components/session` not run**.

**Done so far (committed as `fix(session-sidebar): port sidebar callers onto the canonical session shape`):**
- `sidebar/list/sessionCollection.ts`: `child.id` → `child.sessionId`, `session.time.archived` → `archivedAt`.
- `sidebar/list/useSessionPrefetch.ts`: `PrefetchTarget` back to the contract `Session`; directory through `resolveGlobalSessionDirectory`.
- `sidebar/list/useSessionListSync.ts`: removed upstream's `authoritativeSessions` (not on the fork store); cleanup reads `activeSessions` + `archivedSessions` gated on `status === 'ready'`.
- `sidebar/list/sessionListDirectories.test.ts`, `session/SessionSidebar.tsx`: restored the `includeWorktrees` option both sides need.
- `sidebar/sessionSidebarRowModel.ts`, `sidebar/sessions/SessionTreeItem.tsx`, `sidebar/projects/useSessionGrouping.test.tsx`, `sidebar/sessions/SessionNodeItem.tsx`: `node.resolveGlobalSessionDirectory(session)` (upstream's broken call, also present pre-merge) → `resolveGlobalSessionDirectory(node.session)`.
- `SessionNodeItem.tsx`: `parentID`→`parentSessionId`, `sessionID`→`sessionId` for the record loaders, `entry.id`/`entry.directory` → `sessionId`/resolver, `getSessionWorktreeMenuState` gets `isRefreshing`, `areSessionRenderSemanticsEqual` rewritten on contract fields, `getSessionPinList` dropped (see below).

**Not finished (remaining 202 errors):** pin-list storage on sessions (`getSessionPinList` has no fork equivalent — the contract's `openchamber.pinned` carries only `at`, so `PinToMenu` currently offers Pinned only and `workFacts.pin` is `DEFAULT_PIN_LIST`; the fork needs a contract decision), provider/model catalog callers in the dialogs (`providers.find(item => item.id)` → `providerId`; `modelId`; `config.loadAgents` → `useAgentsStore.loadAgents`; `selectConfigAgentsForDirectory` removed), `MoveSessionDialog`/`SessionDialogs`/`TodoSendDialog`/`ForkSessionDialog`/`ReviewFlowDialog`/`ProjectNotesTodoPanel` (`PlanView` has no `leading`/`visible` in the fork), the spaces code in `useWorktreeWork`/`SidebarHeader` (fork `SpaceMark` has no `taskTitle`, no `setSpaceTaskTitle`, no `setGitWorktreePinned` in `gitApi`, no `useHasUnreadSession`), the remaining test fixtures (contract session shape), and cross-component props (`notifyOnSubtasks`, `hideDirectoryControls`, `sessionOwnerById`). No deletes of retired OpenCode imports or drift-reason rows have been made yet, so the 37 unexplained paths and the deletes box stay open.
