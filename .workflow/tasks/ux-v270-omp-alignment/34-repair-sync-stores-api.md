# 34: Make the merged sync, stores and UI API layer compile

**Effort:** ux-v270-omp-alignment
**Task type:** bugfix
**Blocked by:** 30
**Covers:** W2
**Files:** `packages/ui/src/sync/**`; `packages/ui/src/stores/**`; `packages/ui/src/api/**`; `packages/ui/src/contexts/**`; their tests; slice 34 rows in `repair-slices.tsv`
**Read first:** spec "How it is built" (Merge); the archived task 15 record; `packages/ui/src/sync/DOCUMENTATION.md`; `packages/ui/src/stores/DOCUMENTATION.md`; skills `sync-state-invariants`, `ui-api-decoupling`, `openchamber-change-discipline`
**Check:** in your worktree, `bun check --all` → 0 errors in slice 34 files (about 310 errors at scaffold `93a3c7549`: sync 187 in 27 files, stores 107 in 15 files, api 13, contexts 3; most are in tests); `bun scripts/upstream-drift.mjs --check --slice 34` → 0 unexplained; `VITEST_MAX_WORKERS=2 bunx vitest run packages/ui/src/sync packages/ui/src/stores packages/ui/src/api` → exit 0
- **Base commit:** f3afaa8d6504b5eb2f9a1fd8e7de4184ca551f31
- **Status:** active

- [x] Fix every type error in slice 34 files. Production code keeps the Canonical Client event model and Host session authority; tests are brought onto the shapes production now has.
- [x] Exported shapes other slices consume stay as they are on the scaffold. If a shape must change to fix an error here, update every caller outside this slice in the same commit and list them in `## Progress`.
- [x] Do not change hydration or reducer semantics; task 22 owns that cutover.
- [x] Tests: fix kept behaviour, delete tests pinning retired OpenCode behaviour (named in `## Progress`).
- [x] Give every slice 34 `unexplained` path a reason.
- [x] Deletes: imports of removed OpenCode modules and their dead branches.
## Progress

The slice compiled by restoring the fork's own shapes where the merge had left
upstream's OpenCode-era ones, and by deleting the upstream modules the fork
retired (task 15's rule: the Canonical Client event model and Host session
authority stay).

- **`bun:test` types.** The merge took upstream's thinner
  `packages/ui/src/types/bun-test.d.ts`, which lacks `resolves`, the spy
  mutators and the asymmetric matchers the fork's 186 suites use. Restored the
  fork's shim (`e04b3dfb`), which also keeps the owner's `decision` row intact.
- **Production files back on `main`:** `selection-store.ts`, `session-pins.ts`,
  `notification-store.ts`, `last-session-restore.ts`, `control-stream-sync.ts`,
  `contexts/ThemeSystemContext.tsx`, and the quota pair
  `stores/useQuotaStore.ts` + `lib/quota/fetchQuota.ts`. Upstream's versions
  need `@/lib/opencode/*`, `getUnreadSessionIds`, pin lists or
  `loadedWorkspaceId`; the fork's callers (sidebar, mobile, tray) use
  `markAllSessionsViewed`, `useSessionUnread` and `toggleSessionPin`.
- **Deleted resurrected upstream modules (no fork caller):**
  `sync/background-images{,.test}.ts`, `form-request-error{,.test}.ts`,
  `recoverable-questions{,.test}.ts`, `reply-commands{,.test}.ts`,
  `session-selection{,.test}.ts`, `transcript-cut.ts`, `auto-review-sync.ts`,
  `space-session-project{,.test}.ts`, `tool-content-completion.test.ts`.
- **Deleted upstream-only tests for retired OpenCode behaviour:**
  `sync/draft-first-send.test.ts` (`pendingDraftSends`, `SessionMessagePageSource`,
  `sendRecoveredFormAnswer`), `sync/session-actions.compact.test.ts`,
  `sync/session-actions.retry-pick.test.ts` (`applyModelPickToRetry`),
  `sync/session-admission.test.ts` (`@/lib/opencodeTrust`, `session-event-router`),
  `sync/input-store.desktopPath.test.ts` (desktop byte payload),
  `stores/useGlobalSessionsStore-head.test.ts` and
  `stores/useGlobalSessionsStore.runtime.test.ts` (`SessionPage`/`time` model),
  `stores/session-project-registration.test.js` (`server/lib/opencode` import),
  `stores/useQuotaAutoRefresh.test.tsx` and
  `stores/useQuotaStore.extensionProviders.test.ts` (upstream quota fields).
- **Kept tests brought onto fork shapes:** `stores/sessionLineage.test.ts`
  back to `main` (no `fork`/`btwPromoted` fields);
  `useAgentsStore.subagents.test.tsx`, `useSnippetsStore.test.ts`,
  `sync/input-store.test.ts`, `useQuotaStore.refresh.test.ts` and
  `useQuotaStore{,.same-origin}.test.ts` back to `main` (upstream variants test
  removed store members); dropped one upstream case in
  `useAgentsStore.catalog-refresh.test.ts` (`opencodeClient.listAgents`);
  dropped the `loadedWorkspaceId` assertion and the three upstream
  `labelSource` provenance cases (`ProjectEntry` has no provenance field);
  `permissionStore.test.ts` and `useConfigStore.test.ts` now *patch*
  `@/lib/runtime-fetch` instead of replacing it, so `runtime-cleanup`'s
  `addRuntimeProxyHeaders` import still resolves.
- **`safeStorage.ts`**: `StateStorage.getItem` returns `string | null |
  PromiseLike<string|null>`; narrowed on the synchronous value instead of
  `instanceof Promise`, which does not accept a `PromiseLike`.
- No exported shape changed for outside callers: every restored file is the
  `main` blob, so `markAllSessionsViewed`, `useSessionUnread`, `toggleSessionPin`
  and `setSessionPinList` (their sidebar/mobile consumers) are exactly as on
  `main`.
- Slice-34 drift: `--check --slice 34` reports zero unexplained; every path the
  merge resurrected or restored now resolves to the fork's blob, so its class
  comes from the standing boundary/exclusion rule or the existing decision row.
- Surface list (no behavior change; all four retained runtimes keep the Host
  Canonical Client): web, Electron desktop, hosted mobile, Capacitor mobile.

- **Check before:** `bun check --all` → 1,130 errors repo-wide, 310 in slice 34
  (46 files); `bun scripts/upstream-drift.mjs --check --slice 34` → 0 unexplained;
  `node scripts/run-isolated-tests.mjs packages/ui/src/{sync,stores,api}` → 6 files failing.
- **Check after:** `bun check --all` → 791 errors repo-wide (all in other
  slices), **0 in slice 34**; `bun scripts/upstream-drift.mjs --check --slice 34`
  → `drift check passed`, exit 0;
  `node scripts/run-isolated-tests.mjs packages/ui/src/sync packages/ui/src/stores packages/ui/src/api`
  → **169/169 test files passed**, exit 0 (this is the bun:test runner the
  suites are written for; `bunx vitest run` on the same paths cannot load
  `bun:test` and no root Vitest config exists on this tree);
  `bunx oxlint` on the changed files → exit 0, no findings.
