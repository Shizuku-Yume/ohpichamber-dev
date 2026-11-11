# 34: Make the merged sync, stores and UI API layer compile

**Effort:** ux-v270-omp-alignment
**Task type:** bugfix
**Blocked by:** 30
**Covers:** W2
**Files:** `packages/ui/src/sync/**`; `packages/ui/src/stores/**`; `packages/ui/src/api/**`; `packages/ui/src/contexts/**`; their tests; slice 34 rows in `repair-slices.tsv`
**Read first:** spec "How it is built" (Merge); the archived task 15 record; `packages/ui/src/sync/DOCUMENTATION.md`; `packages/ui/src/stores/DOCUMENTATION.md`; skills `sync-state-invariants`, `ui-api-decoupling`, `openchamber-change-discipline`
**Check:** in your worktree, `bun check --all` → 0 errors in slice 34 files (about 310 errors at scaffold `93a3c7549`: sync 187 in 27 files, stores 107 in 15 files, api 13, contexts 3; most are in tests); `bun scripts/upstream-drift.mjs --check --slice 34` → 0 unexplained; `VITEST_MAX_WORKERS=2 bunx vitest run packages/ui/src/sync packages/ui/src/stores packages/ui/src/api` → exit 0
- **Base commit:** f3afaa8d6504b5eb2f9a1fd8e7de4184ca551f31

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
  `notification-store.ts`, `last-session-restore.ts`, `control-stream-sync.ts`
  and `contexts/ThemeSystemContext.tsx`. Upstream's versions need
  `@/lib/opencode/*`, `getUnreadSessionIds` or the OpenCode page model; the
  fork's callers (sidebar, mobile, tray) use `markAllSessionsViewed`,
  `useSessionUnread` and `toggleSessionPin`.
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
  `sync/input-store.desktopPath.test.ts` — **restored**, see below (it asserts
  `pathForDroppedFile` → `agentPath`, which fork production still does),
  `stores/useGlobalSessionsStore-head.test.ts` and
  `stores/useGlobalSessionsStore.runtime.test.ts` (`SessionPage`/`time` model),
  `stores/session-project-registration.test.js` (`server/lib/opencode` import),
  `stores/useQuotaAutoRefresh.test.tsx` and
  `stores/useQuotaStore.extensionProviders.test.ts` (upstream quota fields).
- **Quota correction (second pass).** The
  first pass restored `useQuotaStore.ts` and `lib/quota/fetchQuota.ts` to `main`
  as well, which broke outside-slice callers: `components/sections/usage/UsagePage.tsx`
  imports `useQuotaProviders`, `setProviderInDropdown` and `useQuotaAutoRefresh`,
  and the settings readout imports `refreshTrayQuotas`, all of which only the
  merged store exports. The scaffold (upstream) quota store, `fetchQuota` and
  `useQuotaStore.test.ts`/`.same-origin`/`.refresh`/`useQuotaAutoRefresh`/
  `.extensionProviders` are kept instead; `useQuotaStore.refresh.test.ts` drops
  the two workspace-scoped cases and the `loadedWorkspaceId` assertion that the
  merge retired. `bun check --all` outside-slice errors go 791 -> 780.
- **Wrongly deleted test restored.** `sync/input-store.desktopPath.test.ts`
  was deleted as "desktop byte payload", but its 18 cases exercise
  `pathForDroppedFile` → `agentPath` and the oversized-file note path, which
  `sync/input-store.ts` still implements. It passes unchanged against the
  current store, so the fork's own blob is back.
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
- **Outside-slice regression fix (third pass).** Restoring the fork blobs
  dropped three exports that other slices import, adding four outside-slice
  errors: `markAllSessionsViewed` (`apps/MobileSessionsSheet.tsx`,
  `components/session/sidebar/shell/SidebarHeader.tsx`), `setSessionPinList`
  (`components/session/sidebar/sessions/SessionNodeItem.tsx`) and the scaffold
  quota store's `useQuotaProviders`/`setProviderInDropdown`/`useQuotaAutoRefresh`
  (`components/sections/usage/UsagePage.tsx`). Restored each at its source,
  without editing any other slice's file:
  `markAllSessionsViewed` walks the Host's unread sessions
  (`isSessionUnread` over `useGlobalSessionsStore.entityById`), marks each
  viewed, clears its native notification and posts one `/view`; `markSessionViewed`
  keeps the scaffold's per-session cleanup (native notification clear plus one
  `/view` post) that the fork blob had dropped; `setSessionPinList`
  shares the single `writeSessionPin` queue with `toggleSessionPin` and files
  any list under `Pinned` because `packages/agent-contract` keeps
  `openchamber.pinned = { at }` (recorded in `.workflow/decisions.md`,
  2026-11-11). `ErrorNotification`/`appendErrorNotification` are exported again
  so any caller written against the scaffold compiles. Outside-slice per-file error counts now equal the scaffold's
  exactly: MobileSessionsSheet 2, SidebarHeader 2, SessionNodeItem 28,
  UsagePage 0.
- Exported shapes outside callers consume are unchanged from the scaffold:
  `markAllSessionsViewed`, `useSessionUnread`, `toggleSessionPin`,
  `setSessionPinList`, `useQuotaProviders`, `setProviderInDropdown` and
  `useQuotaAutoRefresh` all carry the scaffold's signatures.
- Slice-34 drift: `--check --slice 34` reports zero unexplained; every path the
  merge resurrected or restored now resolves to the fork's blob, so its class
  comes from the standing boundary/exclusion rule or the existing decision row.
- Surface list (no behavior change; all four retained runtimes keep the Host
  Canonical Client): web, Electron desktop, hosted mobile, Capacitor mobile.

- **Check before:** `bun check --all` → 1,130 errors repo-wide, 310 in slice 34
  (46 files); `bun scripts/upstream-drift.mjs --check --slice 34` → 0 unexplained;
  `node scripts/run-isolated-tests.mjs packages/ui/src/{sync,stores,api}` → 6 files failing.
- **Check after (final):** `bun check --all` → 777 errors repo-wide (all in
  other slices; scaffold had 1,130), **0 in slice 34**, and no outside file has
  more errors than at scaffold; `bun scripts/upstream-drift.mjs --check --slice 34`
  → `drift check passed`, exit 0;
  `node scripts/run-isolated-tests.mjs packages/ui/src/sync packages/ui/src/stores packages/ui/src/api`
  → **172/172 test files passed**, exit 0 (this is the bun:test runner the
  suites are written for; `bunx vitest run` on the same paths cannot load
  `bun:test` and no root Vitest config exists on this tree);
  `bunx oxlint` on the changed files → exit 0, no findings.
- **Landing (target had moved past task 31).** The landing merge conflicted on
  `.workflow/upstream-deltas.tsv` (two rows) and on
  `sync/notification-store.ts`: the target's task-31 handoff had already
  resolved that file to the error-only store, so the target side won, and
  `session-ui-store.ts` keeps the branch's scaffold blob because the target's
  partial edit saved effort as the agent/model variant, which its own
  `session-ui-store.test.js` rejects. Landed as `0460ca3fb`; the target's
  pre-merge and post-merge `bun check --all` totals are identical (**261**,
  0 in slice 34), so the landing added no error anywhere.
- **`bun-test.d.ts` each() overload.** Task 33's stricter shim declared only the
  spread-tuple form `each<T extends Readonly<[unknown, ...unknown[]]>>`, which
  rejected the slice's `test.each([...scalars])` call shape (31 slice errors on
  the landed target). Added the flat-row overload beside it, which is what bun's
  runtime does; slice 34 returns to 0.
- **Scaffold comparisons after other slices landed.** The four files still
  above their scaffold count on the target (`lib/modelRefs.test.ts`,
  `lib/modelVariants.test.ts`, `sidebar/sessions/collapsedActivityIndicator.test.ts`,
  `sidebar/projects/useSessionSidebarSections.ts`) are not in this branch's
  diff (`git diff --name-only f3afaa8d6..HEAD` is empty for each); they came
  from slices that landed after this one started. Task 34's landing moved the
  target from 2,049 errors to 76 and added none.
- **Out of slice, pre-existing:** `hooks/useTraySync.test.tsx` fails on
  `markSessionViewed` → `markSessionUnreadSeen` → `upsertSession`: the test's
  session fixture carries no `metadataRevision`/`epoch`, so
  `compareSessionRevision` throws and the `/view` POST has no base URL. It
  fails identically at scaffold `f3afaa8d6` and at `0834b96f0` before the
  notification restore, so it is not caused here; slice 32/35 owns the hook.
