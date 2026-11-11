# 35: Repair UI libraries, hooks and web client, and explain the unowned docs, SDK, Electron and script paths

**Effort:** ux-v270-omp-alignment
**Task type:** bugfix
**Blocked by:** 30
**Covers:** W1, W2
**Files:** `packages/ui/src/{lib,hooks,types}/**`; `packages/web/src/**`; `packages/docs/**`; `packages/sdk/**`; `packages/electron/**`; `packages/extensions/**`; `packages/mobile/**`; `scripts/**` (except `scripts/upstream-drift*`); root config files (`.gitignore`, `.gitattributes`, `knip.json`, `oxlint.config.ts`, `docker-compose.yml`, `docs/`); slice 35 rows in `repair-slices.tsv`
**Read first:** spec "How it is built" (Merge); the archived task 14 and 18 records; `packages/sdk/DOCUMENTATION.md`; `packages/electron/README.md`; skills `desktop-shell`, `ui-api-decoupling`, `openchamber-change-discipline`
**Check:** in your worktree, `bun check --all` → 0 errors in slice 35 files (about 92 at scaffold `93a3c7549`: ui lib 37, web client 40, hooks 15); `bun scripts/upstream-drift.mjs --check --slice 35` → 0 unexplained (about 545 paths today: docs 453, sdk 38, electron 28, scripts 20, root config 6); `bun --cwd packages/sdk test && bun --cwd packages/electron test && bun run docs:validate` → exit 0
- **Base commit:** f3afaa8d6504b5eb2f9a1fd8e7de4184ca551f31

- [x] Fix every type error in slice 35 files by porting merged callers onto the fork's contracts. Do not change exported shapes in `src/sync`, `src/stores` or `src/api`.
- [x] For each unexplained path: take upstream's content when the fork's difference is accidental or stale, keep the fork's content with an `upstream-deltas.tsv` row citing a decision when it is OMP-specific. Product docs describe OMP behaviour where it differs and otherwise follow upstream. Group rows by decision; one row per path is still required.
- [x] Root `README.md`, `AGENTS.md`, `SECURITY.md`, `CONTRIBUTING.md` and `CHANGELOG.md` stay as they are.
- [x] Deletes: fork docs pages for retired VS Code or OpenCode surfaces, and accidental fork differences in SDK, Electron and script files.

## Progress

**Check before:** `bun check --all` in this worktree at `f3afaa8d6` reported 92 errors in slice 35 files (`packages/ui/src/{lib,hooks,types}/**`, `packages/web/src/**`): ui lib 37, web client 40, hooks 15. `bun scripts/upstream-drift.mjs --check --slice 35` reported 553 unexplained paths in the slice (none under `packages/ui/src/{lib,hooks,types}` or `packages/web/src`).

**Check after:** on the final scaffold-merged tree (`53d5f82bf`, scaffold `c6dc82c15`):
- `bun check --all` → 0 errors in slice 35 files (8 errors remain in 2 files elsewhere: `components/session/sidebar/projects/useSessionSidebarSections.ts` and `components/session/sidebar/sessions/collapsedActivityIndicator.test.ts`, both slice 32/33 territory).
- `bun scripts/upstream-drift.mjs --check --slice 35` → exit 0: no conflict markers, no unexplained path in slice 35, no contradicting ledger row. The whole-repo variant reports 32 unexplained paths outside the slice (docs locales and section/components surfaces the other lanes' merges changed), none under this slice's code paths.
- `bun --cwd packages/sdk test` → 32/32 files pass; `VITEST_MAX_WORKERS=2 bun --cwd packages/electron test` → 71/71 files pass; `bun run docs:validate` → 696 pages, 58 sidebar links.
- `VITEST_MAX_WORKERS=2 bun test` in `packages/ui` over the eleven touched unit-test files (`modelRefs`, `sessionTabScope`, `sidebarSessionRows`, `worktrees/worktreeUse`, `i18n/textDirection`, `guests/host-bridge`, `guests/files`, `search/subsequenceSearch`, `lib/settings/registry`, `lib/runtime-cleanup`, `hooks/useRouter`) → 101 pass, 0 fail.
- `bunx oxlint` → exit 0 on every file created or substantially rewritten, including the final merge resolutions.

**Commits:** `a5f056844` (callers ported onto the fork contracts), `a86ca9f10` and `53d5f82bf` (scaffold merged into the branch; the ledger keeps both sides' rows collapsed to one per path, `modelRefs.ts` takes the optional-chained lookup, and `repository-references.ts` imports the review-state result type from its `source-control/types` owner), `69fd9b34e` (review-round test restorations and the session-tab scope fix), `19ab4c55f` (docs and evidence), plus the archive commit.

**Ports, each deleting what it replaced:**
- `lib/modelRefs.ts`, `lib/sessionTabScope.ts`, `lib/sessionWorkflowMetadata.ts` and their tests now read `@openchamber/agent-contract` `Session`/`Model`/`Provider` (`sessionId`, `workspaceId`, `updatedAt`, `archivedAt`, `parentSessionId`, `displayPath`) instead of the retired `@/lib/opencode/model`.
- `lib/sidebarSessionRows.test.ts` was rewritten onto the fork's `sessionHasSidebarRow(session, { isPlaced, isPinned })` contract (upstream's `isAdmitted`/`zones` parameters do not exist in the fork).
- `lib/worktrees/worktreeUse.ts` keeps `sessionsInWorktree`/`withSessionsNowInWorktree`; its duplicate `readWorktreeUse` was dropped because `components/overview/overviewActions.ts` owns the live one over the canonical status store.
- `hooks/useGitComparison.ts` + `hooks/usePullRequestComparison.ts` take the change-request term from `useChangeRequestTerm(provider)`; range file versions are read through `lib/gitApiHttp` because the fork's `gitApi` exposes no such wrapper.
- `hooks/useQuotaProviderSync.ts` reloads extension usage providers on `guests-changed` (the event the fork Host broadcasts).
- `lib/i18n/store.ts` `formatMessage` keeps its `I18nDictionary` signature; the one test that passed a partial per-locale literal (`i18n/textDirection.test.ts`) builds its Arabic dictionary as `{ ...enDict, ...arDict }`, which is what the runtime serves.
- `lib/settings/registry.ts` `sttEndpointPath` takes upstream's `z.string().trim().max(1024)` (rejects an over-long path) instead of the fork's truncating parser.
- Duplicate declarations removed: `packages/web/src/api/repository-references.ts` review block, `source-control.ts` second `authSetSshUrl`, `trackers-schemas.ts` repeated type imports (with `TrackerConnectInfo` now read from `lib/trackers/types`), `trackers.ts` repeated `connectResultOf`, `runtimeConfig.ts` second `reportWindowRuntimeKey`, and `worktreeManager.test.ts`/`worktreeRemovalFlow.test.ts` duplicate mock/import lines.
- Deleted upstream-only files with no fork consumer: `hooks/useComposerConfigDirectory.ts`, `hooks/useRetryModelPick.ts`, `lib/watchedFiles.ts` + test. `hooks/useRouter.test.tsx` and `lib/runtime-cleanup.test.ts` were initially deleted on the false premise that their modules were gone; both modules are live (`apps/MobileApp.tsx` calls `useRouter`, `lib/chatDirectories.ts` calls `captureRuntimeCleanup`), so both tests were restored on the fork contracts. Only the VS Code navigation block and the `@/lib/opencode/client` parts were dropped with them.

**Behaviours restored once the scaffold returned the fields:** the advanced scaffold (`c6dc82c15`) puts `customProviderLogos`, `sessionTabsPerWorkspace` and `contextZoneExpandedChatSizes` back on `useUIStore`'s persisted slice, so the ports were completed rather than left dropped:
- `hooks/useProviderLogo.ts` `preloadProviderLogo` skips an uploaded logo and an extension's logo before preloading again, through `providerLogoUploadSupported()` and `guestProviderLogoOf`.
- `lib/sessionTabs.ts` `closeSessionTabAndActivateNeighbour` opens the new draft in the closed tab's workspace when tabs are per workspace and the directory is not a chats root.
- `lib/settings/registry.ts` carries the `sessionTabsPerWorkspace`, `customProviderLogos` and `contextZoneExpandedChatSizes` rows again, so the store's persisted keys and the registry agree.

**Behaviours that stay dropped** (the fork has no field for them):
- The settings-registry test does not read `ConfigStore.persist.getOptions().partialize` (the fork's config store exposes only `hasHydrated`/`onFinishHydration`/`rehydrate`) and there is no `workStatusSectionOrderExplicit` flag. The test instead asserts that `setDictationAutoSend` writes the preference to device storage, and that `sanitizeWorkStatusSectionOrder`/`resolveWorkStatusSectionOrder` drop obsolete ids, append gained sections, and still move Context sources out of an unarranged default.

**Review round 1 fixes (same slice, ledger and docs left to t35-drift):**
- `lib/runtime-cleanup.test.ts` restored: five tests over `captureRuntimeCleanup` itself (direct cleanup, chat deletion through the captured transport, same-origin deferral with refreshed credentials, pending retry when the owner returns, relay cleanup held for the owning tunnel). Nothing asserts the retired SDK client.
- `hooks/useRouter.test.tsx` restored: six tests over `useRouter` (cold open adds one entry with one-step Back, repeated Back to a message link, initial message link, PWA notification, and Back during a cold start from both entry points). The VS Code command test went with its retired module.
- `lib/sessionTabScope.ts` resolves a session's folder through `resolveGlobalSessionDirectory(session)` (its workspace directory) instead of comparing the project-relative `displayPath` with absolute paths; fixtures now carry valid canonical `displayPath` values and bind workspaces through `registerWorkspaceDirectory`. The fork has no `getSessionActivityTime`; a canonical session's `updatedAt` is its activity stamp, so the ranking keeps `updatedAt`.
- `lib/settings/registry.test.ts` exercises the fork's real sanitizer and the config store's own persistence path; `lib/worktrees/worktreeUse.test.ts` restores `useGlobalSessionsStore` around each test.
- Docs: `components/views/files/DOCUMENTATION.md` no longer claims a `lib/watchedFiles.ts` OpenCode filesystem watch; it describes the 8-second expanded-directory poll, the 2-second open-file stat poll (skipped while the document is hidden) and the tool-part driven `lib/fileTreeChanges.ts` re-list. `lib/settings/DOCUMENTATION.md` drops the nonexistent `workStatusSectionOrderExplicit` sibling.

**Files outside the slice touched:** none by this worker. The drift worker's branch commits touched `packages/docs/**`, `packages/sdk/**`, `packages/electron/**`, `scripts/**`, root config and `.workflow/upstream-deltas.tsv`; the ledger rows for `components/dictation/InlineDictationButton.tsx`, `components/mcp/McpDropdown.test.tsx`, `hooks/useProviderLogo.ts` and `hooks/useQuotaProviderSync.ts` cited the wrong decision heading and were re-cited to the merge decision with their real reasons.
