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

Dirty at start: unavailable (no original dirty-at-start record survived). Dirty at resume: none at `eab022c3d`. Base commit `f5624ac7fb3d902b5f6ed091ad22baeb74ade525` restored (M2 gate before core migration); started `2026-10-14T09:07:39+08:00`, status active.

### Integrated core commits

The initial core implementation is integrated on the integration worktree:
- Canonical transport: `a02ef8a2228f8721148637ab2ddacb83b41de1e3` (first transport timestamp `2026-10-14T09:07:39+08:00`).
- Canonical session: `6efda48df`.
- Canonical sync: `afffdda79`.
- Transport/sync follow-up: `eab022c3d` (resolves missing canonical MCP imports, non-OK SSE ProblemDetails, unexpected stream EOF, and workspace dependency).

### Observed integration checks

Existing check observations (recorded from integration runs, not rerun):
- Broad sync isolated runner after workspace link: 44/71 test files pass.
- `session-ui-store`: 51 passing / 31 failing tests across 27 failing files, primarily due to remaining OpenCode fixtures/dependent callers alongside native compile mismatches.
- UI typecheck failed: downstream canonical-record consumers are not yet migrated and Task 13 native production blockers remain.
- No green M3 claim is made.

### Active repair worktrees and proofs

- Automatic isolated agent spawn failed prior to edits because the 1.3 GB snapshot exceeded the 1.0 GB budget. Explicit git worktrees avoid snapshot budget issues without modifying configuration.
- Core production compile repairs run in separate worktree `m313-sync-compile`.
- Legacy sync test conversion runs in separate worktree `m313-sync-tests`.
- Native session controls (branch leaf selection and workspace relocation) run in separate worktree `m313-native-controls` (in progress, unverified).
- Connected CanonicalClient transport proof verified on receipt `/home/shizuku/Project/ohpichamber-omp-artifacts/m313-canonical-client-proof-receipt.json` (`bun /tmp/m313-client-proof.mjs`, exit 0 once): exercises CanonicalClient → runtimeFetch → Host HTTP (`registerCanonicalHostRoutes`, `registerCanonicalSessionRoutes`) → supervisor.request → private Bun service → dedicated SDK worker → loopback OpenAI-compatible provider (1 request, sequence 1..12, 2 messages/2 parts matching history IDs, snapshot head 12, 8 recovered events duplicate-free, abort cancelled). Limitations are explicit: caller publication token guard verified around delayed response, not actual UI sync publication; fixture bearer auth is not production auth certification; clean shutdown and throwaway script removal confirmed; M2 receipts reused unchanged. Existing broad suite failures preserved; no green M3 claim.

### Dependency and surface boundaries

- **Task dependency clarification:** Task 13 owns the transport-facing Canonical Client, session streaming, and sync core. Obsolete Task 13-owned sync and client-helper boundaries are removed within Task 13. Remaining legacy execution client removal (`packages/ui/src/lib/opencode/client.ts`, legacy routes, and execution callers) occurs in Tasks 16 and 17 after consumer migration (Tasks 14–16), resolving the circular dependency where Tasks 14–16 are blocked by Task 13.
- **Downstream sequence:** Tasks 14–16 consumer slices remain pending, followed by Task 17 cutover (blocked by Tasks 14, 15, 16, and 22) and Task 18 integrated Web/Electron acceptance (blocked by Tasks 10, 11, 14, 15, 16, and 17).
- **Surface boundaries:**
  - Web/PWA: active Host transport.
  - Electron main/mini: shares the same canonical client through runtime transport.
  - Hosted/Capacitor mobile: remote Host canonical state, no local service.
  - Guest: separate SDK unchanged.
  - VSCode: retired.

### Next action

Land production compile repairs from `m313-sync-compile`, land converted sync tests from `m313-sync-tests`, and complete native session controls in `m313-native-controls` following clarified contracts. Run focused core tests in separate `bun test` processes, authored oxlint, and core-only typecheck. Hand off to downstream consumer migration (Task 14). Checkboxes remain unticked and the task remains active until downstream integration and Gate 18.
