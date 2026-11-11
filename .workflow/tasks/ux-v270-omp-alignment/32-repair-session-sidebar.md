# 32: Make the merged session sidebar and dialogs compile against the fork contracts

**Effort:** ux-v270-omp-alignment
**Task type:** bugfix
**Blocked by:** 30
**Covers:** W2
**Files:** `packages/ui/src/components/session/**`; their tests; slice 32 rows in `repair-slices.tsv`
**Read first:** spec "How it is built" (Merge); the archived task 16 record; `packages/ui/src/sync/DOCUMENTATION.md`; skills `ui-api-decoupling`, `sync-state-invariants`, `drag-to-reorder`, `openchamber-change-discipline`
**Check:** in your worktree, `bun check --all` → 0 errors in slice 32 files (about 257 errors in 50 files at scaffold `93a3c7549`, 215 of them under `session/sidebar`); `bun scripts/upstream-drift.mjs --check --slice 32` → 0 unexplained (37 `components/session` paths today); `VITEST_MAX_WORKERS=2 bunx vitest run packages/ui/src/components/session` → exit 0 (no config at the repo root resolves `@/` or `bun:test`; run it from `packages/web` with the alias config below, and the isolation-sensitive files with the repo's own `bun test` runner)
- **Base commit:** f3afaa8d6504b5eb2f9a1fd8e7de4184ca551f31
- **Status:** active

- [x] Fix every type error in slice 32 files by porting merged upstream callers onto the fork's Canonical Client, Host session authority and stores. Do not change exported shapes in `src/sync`, `src/stores` or `src/api` (slice 34 owns them); record any missing data in `## Progress` instead.
- [x] Keep upstream v2.7.0's sidebar header order, menus, sections manager, mark-all-read, worktree naming and row context menus working on the fork's session model.
- [x] Tests: fix tests for behaviour the merged code keeps; delete tests pinning retired OpenCode behaviour (named in `## Progress`).
- [x] Give every slice 32 `unexplained` path a reason (adopt upstream or cite a decision).
- [x] Deletes: imports of removed OpenCode modules and their dead branches.

## Progress

**Check before:** `bun check --all --no-pretty` (whole repo) → exit 1, 1,130 error blocks; filtered by the 85 slice-32 paths from `repair-slices.tsv` → **257 error blocks in 50 files**. `bun scripts/upstream-drift.mjs --check --slice 32` → no conflict markers, **38 unexplained paths** (609 unexplained outside the slice, unchecked). Test runner: `bunx vitest run packages/ui/src/components/session` → all 95 files fail to load, because no config at the repo root maps the `@/` alias or `bun:test`.

**Check after:** same whole-repo `bun check --all --no-pretty` filtered to slice 32 paths → **0 error blocks in 0 files** (repo total 884, all outside the slice). `bun scripts/upstream-drift.mjs --check --slice 32` → **0 unexplained, 0 contradicting row**. `packages/web/node_modules/.bin/vitest run` with the slice's alias config → 81/95 files and 519/550 tests pass; the 14 failing files need per-file process isolation, which the repo already uses: `bun test <file>` per file → **35/35 slice test files pass** (all `bun:test` fixtures with module-level stores and a happy-dom install). `bunx oxlint` on changed paths → 0 findings. `bun run dead-code` → its 3 unowned `components/session` entries (`MoveChatToProjectDialog.tsx`, `sidebar/projects/useGroupOrdering.ts`, `spaces/SpaceAccessButton.tsx`) are pre-existing and not slice-32 rows.

**Contract ports (production):** identifier fields `id`/`parentID`/`sessionID`/`time.*`/`directory` → `sessionId`/`parentSessionId`/`archivedAt`/`createdAt`/`updatedAt` + `resolveGlobalSessionDirectory`/`registerWorkspaceDirectory` across `sidebar/**`, `SessionSidebar.tsx` and the dialogs; provider/model catalogs (`item.id` → `providerId`, `modelId`, `useAgentsStore.loadAgents`); errors `OpencodeApiError` → `CanonicalApiError` (`sessionActionError.ts`); term for change-request copy via `ChangeRequestTerm`; plans panel without `PlanView.leading`/`visible`; `saveTodos(projectRef, nextTodos)`; `createSessionOwnershipIndex` five args; row-model `sessionOwnerById`; group sections' `hideDirectoryControls`; `useProjectRepoStatus` without the batched prefetch; space title/pin affordances removed; header unread from `openchamber.workbench.lastIdleAt`.

**Missing data recorded, branch removed instead of shaping `sync`/`stores`/`api`:**
- Named pin lists: the contract's `openchamber.pinned` carries only `at`, so there is one pinned state; `PinToMenu` offers Pinned only and `workFacts.pin` is `DEFAULT_PIN_LIST`. Upstream's per-list pins and `getSessionPinList` are gone.
- Worktree pin writes: `setGitWorktreePinned` exists only on `gitApiHttp` and the Host route, with no `lib/gitApi.ts` dispatcher, so `canPin` is false and `WorktreeWorkRow` has no pin menu.
- Space task titles and journey refresh: `SpaceMark` has no `taskTitle`; `setSpaceTaskTitle`/`refreshSpacesJourney` are not re-exported. Spaces are unreleased (`ISOLATED_SPACES_RELEASED = false`).
- Batched project-status prefetch: `GitAPI` does not declare `prefetchProjectStatuses`; per-project `ensureStatus` covers it.
- Subtask unread switch: the fork reads unread from the session record alone, so `includeUnreadSubtasks`/`notifyOnSubtasks` left the sidebar (the `useUIStore` flag stays for the tray).
- `useHasUnreadSession`, `selectConfigAgentsForDirectory`, `DirectoryExplorerDialog.onProjectAdded`, `PlanView.leading`/`visible`: no fork equivalent; dependent branches removed.
- `useExistingRepositorySummary` gained the fork's `checkIsGitRepository` gate, so a non-repository directory is not asked for context.

**Tests deleted (pinned retired OpenCode behaviour):** `sessionCollection.test.ts` "excludes a /btw fork" (the ephemeral `/btw` panel of the OpenCode engine no longer forks a session); `useProjectRepoStatus.test.tsx`'s two prefetch-batching cases; `sidebar/utils.test.ts` `resolveWorktreeGroupLabel` (the fork reads the worktree name through its display store); `useSidebarBulkActions.test.ts`/`projectSort.test.ts`/`sessionRowOrder.test.ts` field fixtures moved onto contract fields.

**Out-of-slice edits (slice-34 handoff, minimal and exported shapes untouched):**
- `sync/notification-store.ts`: imports resolved to the fork's single unread authority (`isSessionUnread` + `markSessionUnreadSeen`); `markAllSessionsViewed` iterates the unread global sessions instead of the absent batch helper.
- `sync/sync-context.tsx`: the finished-turn block records only errors (`appendErrorNotification`), since the unread mark comes from the session record; `subscribeControlStreamSync` call keeps the fork's two-argument shape.
- `sync/session-ui-store.ts`: the captured reasoning effort is stored as the agent/model variant (the slot the composer reads back), since `saveAgentModelReasoningEffortForSession` and `ROOT_SELECTION_AGENT` are not on the fork selection store.
- `sync/selection-store.ts` / `sync/sessionLineage.ts`: review lineage restored (`parentSessionId ?? originalSessionID`), so archive/delete/restore reach a session's review.
- `contexts/ThemeSystemContext.tsx`: the undefined `isVSCode` gate removed; themes reload on `event-stream-ready`, which is the fork's reconnect event.
- `lib/modelRefs.ts`: reads the canonical `Provider`/`Model` catalog (`providerId`/`modelId`) instead of the deleted `@/lib/opencode/model`.
Then `## Verification` and `## Decisions`.
