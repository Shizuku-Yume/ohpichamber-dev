# 13: Replace Web/Electron agent data access with the Canonical Client

**Effort:** omp-through-m3
**Task type:** refactor
**Base commit:** f5624ac7fb3d902b5f6ed091ad22baeb74ade525
**Started:** 2026-10-14T09:07:39+08:00
**Status:** active

**Delivers:** Shared Canonical Client transport, session stream handling, and sync core for Web and Electron data access with cursor bootstrap, reconnect, and runtime switching, without OpenCode-shaped adapters; full visible session, settings, and residual UI migration remain in downstream tasks.

**Blocked by:** 23
**Files:** `packages/ui/src/`, `packages/web/`, `packages/electron/`, canonical client package and sync documentation/tests

**Read first:** `.workflow/specs/omp-through-m3.md` M3/W7/W8; UI API and sync-state skills; `packages/ui/src/sync/DOCUMENTATION.md`; `packages/ui/src/stores/DOCUMENTATION.md`; `packages/ui/src/sync/sync-context.tsx`; `packages/ui/src/lib/opencode/client.ts`; contracts and Host Gateway architecture
**Covers:** W8

**Check:** Focused core sync/session-loader/bootstrap/event-reducer/selection tests run in separate `bun test <resolved files>` processes (the runner script accepts a directory only), connected CanonicalClient transport proof, authored oxlint, and core-only typecheck findings → bootstrap/reconnect/runtime switching handles snapshot/cursor and stale responses correctly; fetch failure preserves prior authoritative state. The broad sync runner currently includes leaf consumer/model/token/permission tests owned by Task 14 (`lib/messages/userModelChoice`, `stores/utils/tokenUtils/issue2404/session-leaf-subscriptions`) and Host directory-recovery helper extraction owned by Task 16, which cannot pass before downstream tasks land. Full `node scripts/run-isolated-tests.mjs packages/ui/src/sync` and cross-workspace checks remain mandatory after Tasks 14–17 at Gate 18 (W7–W10 integrated), neither waived nor silently reduced.

- [ ] Implement one transport-facing Canonical Client for Web and Electron consumers.
- [ ] Migrate sync context, client helpers, session stores/actions and global state without an OpenCode-shaped adapter.
- [ ] Preserve host-owned RuntimeAPIs, runtimeFetch and realtime transport where they are not agent data access.
- [ ] Define cursor bootstrap/reconnect and runtime-switch reset behavior in the owning sync module.
- [ ] Remove obsolete Task 13-owned sync and client-helper boundaries, leaving remaining old execution client removal to Tasks 16 and 17 after consumer migration.

## Progress

Dirty at start: unavailable (no original dirty-at-start record survived). Dirty at resume: none at `da6eec253` (integration HEAD on `omp-through-m3/recovery-20261013`). Base commit `f5624ac7fb3d902b5f6ed091ad22baeb74ade525` restored (M2 gate before core migration); started `2026-10-14T09:07:39+08:00`, status active.

### Integrated core commits

The parent integration worktree (`/home/shizuku/Project/ohpichamber-worktrees/m1-integration`, branch `omp-through-m3/recovery-20261013`) contains the following core commits:
- Canonical transport: `a02ef8a2228f8721148637ab2ddacb83b41de1e3` (first transport timestamp `2026-10-14T09:07:39+08:00`).
- Canonical session: `6efda48df`.
- Canonical sync: `afffdda79`.
- Transport/sync follow-up: `eab022c3d` (resolves missing canonical MCP imports, non-OK SSE ProblemDetails, unexpected stream EOF, and workspace dependency).
- Canonical sync compile repairs: `c7a07e6b1` (from `d0df520`, restoring sync compile contracts and missing type exports).
- Transport fixes & SSE lifecycle: `e5a4c610d` (from `0b6fcafaf`, binding canonical transport identities and SSE lifecycle).
- Semantic transport regression tests: `793a4f444` (from `94a793cc7`).
- Host direct-command admission: `90e96dc35` (from `41bcf9f35`, durably admitting direct session commands).
- Native sync test repairs: `d22cc58b8` (from `b5b5101b3`, repairing 9 test suites across DOM mock, loader, and event reducer contracts).
- Host fixture repair: `6686ab640` (from `a17ba65c8`, avoiding asserting private delivery receipt shape).
- Parent composition: `b776e51a2` (integrates `directCommandAdmissionStore` into `packages/web/server/index.js` and updates `canonicalClient.forkSession(snapshot.session, ...)` to use authoritative scoped session objects in `packages/ui/src/sync/session-actions.ts`).
- Sync spy lifecycle follow-up: `5601698fb` (from `6a74f9376`, restoring issue regression spy cleanup).
- Subagent plan amendment: `f84cc6fac` / `da6eec253` (adding Task 32 for native subagent projection and refining M2 receipt phrasing).

### Observed integration checks and verified receipts

Verification observations and receipts recorded from integration runs (not rerun):
- Connected CanonicalClient transport proof verified on receipt `/home/shizuku/Project/ohpichamber-omp-artifacts/m313-canonical-client-proof-receipt.json` (`bun /tmp/m313-client-proof.mjs`, exit 0 once): exercises CanonicalClient → runtimeFetch → Host HTTP (`registerCanonicalHostRoutes`, `registerCanonicalSessionRoutes`) → supervisor.request → private Bun service → dedicated SDK worker → loopback OpenAI-compatible provider (1 request, sequence 1..12, 2 messages/2 parts matching history IDs, snapshot head 12, 8 recovered events duplicate-free, abort cancelled). Limitations are explicit: caller publication token guard verified around delayed response, not actual UI sync publication; fixture bearer auth is not production auth certification; clean shutdown and throwaway script removal confirmed; M2 receipts reused unchanged.
- Client boundary after-receipt verified on receipt `/home/shizuku/Project/ohpichamber-omp-artifacts/m313-client-boundary-after-receipt.json` (`bun /tmp/m313-client-boundary-proof.mjs ... after`, exit 0 once): validates real CanonicalClient/runtimeFetch against loopback adversarial HTTP/SSE fixtures (`wrongMetadataScopeRejected`, `wrongStreamScopeRejected`, `legalCrLfInvalidationDelivered`). Limits: boundary scope and legal framing only, not native service, production auth, or visible UI certification.
- Focused core suite baseline on `/home/shizuku/Project/ohpichamber-omp-artifacts/m313-focused-core-check-results.json` recorded 33 native core files (24 pass, 9 fail against earlier baseline `c7a07e6b1` + `ea5e8b019`).
- Latest standalone check counts after fixture repairs:
  - `packages/ui/src/sync/session-ui-store.test.js`: 72 pass / 0 fail (artifact://2404).
  - `packages/ui/src/sync/event-reducer.test.ts`: 14 pass / 0 fail.
  - `packages/ui/src/sync/session-blocking-request-counts.test.tsx`: 3 pass / 0 fail.
  - `packages/ui/src/sync/session-archive-batch.test.ts`: 5 pass / 0 fail.
  - `packages/web/server/lib/openchamber-sessions/routes.test.js`: 7 pass / 0 fail (artifact://2392).
  - `packages/web/server/lib/host/direct-command-admission-store.test.mjs`: 14 pass / 0 fail (Vitest package test runner under `packages/web`, duration 491 ms).
  - `packages/ui/src/sync/sync-context-selection-boundary.test.tsx`: 4 pass / 0 fail (11 assertions) on actual React navigation path following param rename `sessionID` -> `sessionId` at `session-actions.ts:1922` (committed in `2bf6d7331`).
  - `packages/ui/src/sync/native-leaf-subscriptions.test.tsx`: 3 pass / 0 fail (18 assertions, `bun test packages/ui/src/sync/native-leaf-subscriptions.test.tsx`, parent commit `b00249a31`; narrowed `useSessionDirectory` subscription to `workspaceId` primitive and workspace binding snapshot eliminates render churn; time-only/excluded-root 10/6 updates cause no extra renders).
  - Recheck receipt `/home/shizuku/Project/ohpichamber-omp-artifacts/m313-fixture-recheck-20261014.json` records 10 files and navigation commit `2bf6d7331`.
  - Workflow validation: `.workflow/bin/workflow validate --no-color` passed across 42 task files.
  - Remaining 3 failing suites under active repair in separate explicit worktrees:
    - `packages/ui/src/sync/session-actions.test.ts`: 61 pass / 1 fail (incidental unarchive count).
    - `packages/ui/src/sync/session-message-loader.test.ts`: 34 pass / 1 fail (needs unrelated authority preservation).
    - `packages/ui/src/sync/__tests__/issue-2039.test.ts`: `getSafeStorage` missing mock export, being converted to real fixture without new module mocks.
- No green Task 13 claim is made.

### Active repair worktrees and native controls

- Explicit git worktrees avoid snapshot budget issues without modifying configuration.
- Core production compile repairs (`m313-sync-compile`) and initial native test repairs (`m313-sync-tests`, `m313-test-repair`) are integrated in parent.
- Targeted repairs for the remaining test suites are delegated to separate explicit worktrees.
- Native session controls (branch leaf selection and workspace relocation) remain in progress in agent `ImplementNativeSessionControls` (worktree `m313-native-controls`), not yet committed; source integration pending.
- Task 32 plan (`f84cc6fac` / `da6eec253`) is integrated into the workflow; native backend subagent capability remains absent and unverified (`subagents: false`), with no premature true claim.

### Dependency and surface boundaries

- **Task 13 ownership and closure criteria:** Task 13 owns the core transport-facing Canonical Client, session stream handling, sync core, and root-session controls. Task 13 can close once its focused core checks, connected transport proof, and reviews pass. Integrated visible Web/Electron/full UI checks (W7–W10) remain Task 18.
- **Downstream dependency sequence:**
  - Task 32 (native subagent projection and navigation) is blocked by Task 13.
  - Task 16 (utility generation and residual callers) is blocked by Tasks 12 and 13 (independent of Task 32).
  - Tasks 14 (session/composer timeline) and 15 (settings/sidebar hierarchy) are blocked by both Task 13 and Task 32.
  - Task 17 (cutover) is blocked by Tasks 14, 15, 16, and 22.
  - Task 18 (integrated acceptance) is blocked by Tasks 10, 11, 14, 15, 16, 17, and 32.
  - Because Tasks 32 and 16 depend on Task 13, and Tasks 14 and 15 depend on Task 13 and Task 32, requiring Task 13 to remain active until Gate 18 creates a cyclic dependency. Task 13 does not stay active until Gate 18.
- **Surface boundaries:**
  - Web/PWA: active Host transport.
  - Electron main/mini: shares the same canonical client through runtime transport.
  - Hosted/Capacitor mobile: remote Host canonical state, no local service.
  - Guest: separate SDK unchanged.
  - VSCode: retired.

### Next action

Parent integrates delegated test repairs and native session controls from `ImplementNativeSessionControls` (`m313-native-controls`). Re-verify focused core tests in separate `bun test` processes, authored oxlint, and core-only typecheck. Task 13 closes after its focused core checks, connected proof, and reviews pass, handing off to Task 32 and downstream consumer tasks (Tasks 14, 15, 16); full visible Web/Electron UI checks W7–W10 remain Task 18. Checkboxes remain unticked and Task 13 remains active until those conditions are met.
