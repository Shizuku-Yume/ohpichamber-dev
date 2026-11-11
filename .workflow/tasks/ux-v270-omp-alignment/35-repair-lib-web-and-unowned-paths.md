# 35: Repair UI libraries, hooks and web client, and explain the unowned docs, SDK, Electron and script paths

**Effort:** ux-v270-omp-alignment
**Task type:** bugfix
**Blocked by:** 30
**Covers:** W1, W2
**Files:** `packages/ui/src/{lib,hooks,types}/**`; `packages/web/src/**`; `packages/docs/**`; `packages/sdk/**`; `packages/electron/**`; `packages/extensions/**`; `packages/mobile/**`; `scripts/**` (except `scripts/upstream-drift*`); root config files (`.gitignore`, `.gitattributes`, `knip.json`, `oxlint.config.ts`, `docker-compose.yml`, `docs/`); slice 35 rows in `repair-slices.tsv`
**Read first:** spec "How it is built" (Merge); the archived task 14 and 18 records; `packages/sdk/DOCUMENTATION.md`; `packages/electron/README.md`; skills `desktop-shell`, `ui-api-decoupling`, `openchamber-change-discipline`
**Check:** in your worktree, `bun check --all` → 0 errors in slice 35 files (about 92 at scaffold `93a3c7549`: ui lib 37, web client 40, hooks 15); `bun scripts/upstream-drift.mjs --check --slice 35` → 0 unexplained (about 545 paths today: docs 453, sdk 38, electron 28, scripts 20, root config 6); `bun --cwd packages/sdk test && bun --cwd packages/electron test && bun run docs:validate` → exit 0
- **Base commit:** f3afaa8d6504b5eb2f9a1fd8e7de4184ca551f31
- **Status:** active

- [x] Fix every type error in slice 35 files by porting merged callers onto the fork's contracts. Do not change exported shapes in `src/sync`, `src/stores` or `src/api`.
- [x] For each unexplained path: take upstream's content when the fork's difference is accidental or stale, keep the fork's content with an `upstream-deltas.tsv` row citing a decision when it is OMP-specific. Product docs describe OMP behaviour where it differs and otherwise follow upstream. Group rows by decision; one row per path is still required.
- [x] Root `README.md`, `AGENTS.md`, `SECURITY.md`, `CONTRIBUTING.md` and `CHANGELOG.md` stay as they are.
- [x] Deletes: fork docs pages for retired VS Code or OpenCode surfaces, and accidental fork differences in SDK, Electron and script files.

## Progress

**Check before:** `bun check --all` in this worktree at `f3afaa8d6` reported 92 errors in slice 35 files (`packages/ui/src/{lib,hooks,types}/**`, `packages/web/src/**`): ui lib 37, web client 40, hooks 15. `bun scripts/upstream-drift.mjs --check --slice 35` reported 553 unexplained paths in the slice (none under `packages/ui/src/{lib,hooks,types}` or `packages/web/src`).

**Check after:** on the scaffold-merged tree (`a86ca9f10`, scaffold `f57e72c82`):
- `bun check --all` → 0 errors in slice 35 files (692 errors remain elsewhere in the repo, all outside this slice's paths).
- `bun scripts/upstream-drift.mjs --check --slice 35` → exit 0: no conflict markers, no unexplained path in slice 35, no contradicting ledger row. The whole-repo variant still reports 94 unexplained paths outside the slice, and no unexplained path under this slice's code paths.
- `bun --cwd packages/sdk test` → 32/32 files pass; `VITEST_MAX_WORKERS=2 bun --cwd packages/electron test` → 71/71 files pass; `bun run docs:validate` → 696 pages, 58 sidebar links.
- `bun test` in `packages/ui` over the nine touched unit-test files (`modelRefs`, `sessionTabScope`, `sidebarSessionRows`, `worktrees/worktreeUse`, `i18n/textDirection`, `guests/host-bridge`, `guests/files`, `search/subsequenceSearch`, `lib/settings/registry`) → 89 pass, 0 fail.

**Commits:** `a5f056844` (callers ported onto the fork contracts), `a86ca9f10` (scaffold merged into the branch; conflicts resolved in `.workflow/upstream-deltas.tsv` by keeping both sides' rows and in `packages/ui/src/types/bun-test.d.ts` by taking the scaffold's fuller matcher set).

**Ports, each deleting what it replaced:**
- `lib/modelRefs.ts`, `lib/sessionTabScope.ts`, `lib/sessionWorkflowMetadata.ts` and their tests now read `@openchamber/agent-contract` `Session`/`Model`/`Provider` (`sessionId`, `workspaceId`, `updatedAt`, `archivedAt`, `parentSessionId`, `displayPath`) instead of the retired `@/lib/opencode/model`.
- `lib/sidebarSessionRows.test.ts` was rewritten onto the fork's `sessionHasSidebarRow(session, { isPlaced, isPinned })` contract (upstream's `isAdmitted`/`zones` parameters do not exist in the fork).
- `lib/worktrees/worktreeUse.ts` keeps `sessionsInWorktree`/`withSessionsNowInWorktree`; its duplicate `readWorktreeUse` was dropped because `components/overview/overviewActions.ts` owns the live one over the canonical status store.
- `hooks/useGitComparison.ts` + `hooks/usePullRequestComparison.ts` take the change-request term from `useChangeRequestTerm(provider)`; range file versions are read through `lib/gitApiHttp` because the fork's `gitApi` exposes no such wrapper.
- `hooks/useQuotaProviderSync.ts` reloads extension usage providers on `guests-changed` (the event the fork Host broadcasts).
- `lib/i18n/store.ts` `formatMessage` accepts an `I18nLookup` (partial dictionary), so per-locale literal dictionaries type-check without claiming completeness.
- `lib/settings/registry.ts` `sttEndpointPath` takes upstream's `z.string().trim().max(1024)` (rejects an over-long path) instead of the fork's truncating parser.
- Duplicate declarations removed: `packages/web/src/api/repository-references.ts` review block, `source-control.ts` second `authSetSshUrl`, `trackers-schemas.ts` repeated type imports (with `TrackerConnectInfo` now read from `lib/trackers/types`), `trackers.ts` repeated `connectResultOf`, `runtimeConfig.ts` second `reportWindowRuntimeKey`, and `worktreeManager.test.ts`/`worktreeRemovalFlow.test.ts` duplicate mock/import lines.
- Deleted upstream-only files with no fork consumer: `hooks/useComposerConfigDirectory.ts`, `hooks/useRetryModelPick.ts`, `hooks/useRouter.test.tsx`, `lib/runtime-cleanup.test.ts`, `lib/watchedFiles.ts` + test.

**Behaviours dropped with the reported fixes** (the fork store contract has no field for them; stores were not edited):
- `preloadProviderLogo` no longer skips an uploaded logo or an extension's logo before preloading (no `customProviderLogos` on `UIStore`); a stored logo still draws from the server in `ProviderLogo`.
- `closeSessionTabAndActivateNeighbour` opens a plain draft instead of a draft in the closed tab's workspace (no `sessionTabsPerWorkspace`).
- The settings-registry test no longer asserts `ConfigStore.persist.getOptions().partialize` or a `workStatusSectionOrderExplicit` flag (the fork exposes only `hasHydrated`/`onFinishHydration`/`rehydrate` and one sanitized order); it asserts the round trip and the dragged order instead.

**Files outside the slice touched:** none by this worker. The drift worker's branch commits touched `packages/docs/**`, `packages/sdk/**`, `packages/electron/**`, `scripts/**`, root config and `.workflow/upstream-deltas.tsv`; the ledger rows for `components/dictation/InlineDictationButton.tsx`, `components/mcp/McpDropdown.test.tsx`, `hooks/useProviderLogo.ts` and `hooks/useQuotaProviderSync.ts` cited the wrong decision heading and were re-cited to the merge decision with their real reasons.
