# 22: Cut over server-owned execution consumers

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** 56eecce630fcf2c1052971f01a868ab6819d5b30
**Started:** 2026-10-13T12:12:54Z
**Finished:** 2026-10-13T21:31:53+00:00

**Delivers:** Host execution consumers use the Canonical Agent Service, and authenticated explicit one-time credential handoff runs through the real Bun SDK owner with provider-specific results before M2 gate 23/final task 17 retirement.

**Blocked by:** 10, 12
**Files:** `packages/web/server/index.js`, `packages/web/server/lib/session-work/`, Host credential-handoff owner from task 05, Agent Service AuthStorage integration, permission/queue/routing/small-model/notification modules; focused tests and owner docs

**Read first:** `.workflow/specs/omp-through-m3.md` M2 host integration; contracts and architecture credential boundary; tasks 05/08/12/21; existing host composition and nearest owner documentation
**Covers:** W3, W4, W5, W6, W10

**Check:** Existing isolated runner on affected Host owners, then one disposable Host/real Agent Service scenario with OpenCode absent → queued follow-up dispatches once, approval blocks/resolves, canonical notification and independent FS/Git/PTY/Guest routes work. Explicit user-selected credential handoff proves SDK AuthStorage write/read-reload plus per-provider imported/unsupported/re-auth-required/unavailable outcomes, no secret-bearing response/log/staging and no automatic startup import. Missing required handoff evidence blocks gate 23/task 17, not a fake imported result. Record exact commands; remove temporary smoke code.

- [x] Inventory all server-side execution consumers, including retained M4 features whose execution dependency must change now.
- [x] Replace agent URLs, auth helpers and event consumers directly; do not preserve a dual execution authority.
- [x] Preserve existing orchestration policy and Host authorization rather than redesigning M4 algorithms.
- [x] Keep provider credentials inside the verified OMP-owned boundary, including quota access that previously read OpenCode credentials.
- [x] Complete task-05 explicit intent/preflight with the real service: only after readiness/user intent obtain selected Host credential records or supported selected files, send privately to the Bun owner and perform verified SDK AuthStorage writes/read-reload; Node never loads/writes SDK AuthStorage.
- [x] Preserve original one-time migration acceptance with provider-specific imported or explicit unsupported/re-authentication failure results. No secret staging, startup import, runtime fallback or invented conversion; service/provider absence is unavailable, not success. Complete this evidence before gate 23 and remove importer/legacy readers only in task 17.
- [x] Test service unavailable and partial failure without converting them to empty authoritative success.
- [x] Leave application activation to task 17 after all UI callers move; the disposable service run has no OpenCode fallback.

## Progress

Under `decisions.md: 2026-10-13 - Remove the M2 queue and consumer acceptance cycle`, task 11's committed `sqlite-store.js` and `canonical-runtime.js` Host SQLite queue owner and canonical dispatcher source in `/home/shizuku/Project/ohpichamber-worktrees/m1-integration` (`omp-through-m3/recovery-20261013`) are an available source prerequisite after tasks 10 and 12 complete their acceptance, without waiting for task 11's final composed acceptance first. All actual composed queue/attachment/context-receipt, explicit one-time credential handoff and Host authorization scenarios remain required before task 11 final verification and gate 23; runtime activation remains deferred to task 17.

Dirty at start: none.

Task 10 and task 12 are archived and landed. Work continues on `omp-through-m3/recovery-20261013`; parallel implementation uses separate task-22 worktrees, with the integration owner retaining shared startup, route composition and shutdown files. Task 11 remains paused for the composed acceptance required here.

Check before: the new composed Host/Agent Service scenario is not runnable yet. The current `host/canonical-routes.js` implements M1 preflight and explicit service-unavailable responses, not operational session dispatch or actual credential handoff. The accepted task-10/task-12 receipts cover private service behavior only; unchanged package checks and M1 scenarios are not repeated as a substitute.

Surfaces: Web/PWA and Electron use the authenticated Node Host boundary. Hosted mobile and Capacitor use that same remote Host; neither starts a local Agent Service. Guest actions remain Host capability-scoped and use the same canonical execution owner. This task prepares the composition; application activation remains task 17 after UI callers move.

Implementation slices: S1 owns Host policy/supervisor and trusted Bun input derivation; S2 owns authenticated canonical gateway, explicit selected credential handoff, quota and TTS credential access; S3 owns queue/session/permission/routing/small-model consumers; S4 owns canonical event fan-out and retained execution-dependent features, including the authorized Host-tool bridge. Existing orchestration algorithms remain unchanged. The integration owner composes these modules and runs affected checks once after integration.

### Current integration and verification

S1–S4 source composition covers Host routes, queue, attachments, context, and private credentials. It wires `resolveCredential` into quota, TTS, and routing; propagates workspace scope to classifiers; dispatches stateless credential resolve/handoff under `providerEntry`; preserves native companion ordering; and adds an authenticated 1 MiB strict JSON parser for queue routes. Fresh native sessions accept an absent MCP file while malformed or unreadable configurations still fail.

Affected Host suites passed 44/44 (429 assertions), including the legacy attachment importer. Native session/stateless tests passed 11/11 with service build/type-check; unchanged earlier queue and scoped-consumer evidence is reused. Authored private-credential lint passed. Authored `routes.js` and `routes.test.js` pass `oxlint` with 0 findings. The new real-SQLite archive/unarchive and corrupt-sibling projection regressions passed in the 7-test route suite (9 assertions). Nonblocking dead-code inventory was inspected: `bun run dead-code` exited 1 (unused files 2, exports 34, exported types 10), with no finding on final `routes.js`, `routes.test.js`, or legacy attachment importer changed edges; legacy execution entries and prior catalog exports remain baseline/task 17 removal candidates.

Check after: `node /tmp/m222-composed-proof.mjs /home/shizuku/Project/ohpichamber-worktrees/m1-integration` exited 0. Retained receipt: `/home/shizuku/Project/ohpichamber-omp-artifacts/m222-composed-acceptance-receipt.json`, version 2, 99 assertions and 8 provider requests. The actual Node Host/Bun SDK run proves selected credential handoff and all four outcomes (imported, re-auth-required, unsupported, unavailable), no selected fixture secret in checked responses/settings/non-SDK roots/logs, exact image bytes, queue FIFO/replay/stale CAS, knowledge delivery receipts, native approval/denial side effects, scoped FS/Git/PTY/Guest actions, service-off metadata/archive access, stable history after cold Bun restart, and real completion events through canonical, notification, and control SSE.

Proof repairs: a durable unarchive tombstone is omitted from the canonical timestamp field while retaining its revision, in both list and fork projections; per-session enrichment failure no longer erases complete siblings. The public stream uses the actual snapshot-issued replay cursor.

Reviews and boundaries:
- `ReviewArchiveProjectionDelta` passed with 0 semantic findings, verifying archive batching, authorized session checks, and sibling isolation during corrupt metadata.
- `ReviewM2FinalTrustDelta` passed with 0 findings across explicit credential handoff, private SDK credential resolution/storage reload, Host capability scope registration, and public archive projection.
- `ReviewM2ClosureRequirements` confirmed that all unchanged evidence remains valid and that the sole authored-lint blocker is cleared.
- Earlier Task 22 integrated quality review passed.

Limitations: Startup still logs inherited preferences-write (`ENOENT`) and absent OpenCode binary errors; no clean-startup claim is made. Credential handoff and provider execution operate under the accepted official-provider/OAuth and platform limitations; the old 100 MiB memory target remains failed, not a new SLO. Node Host restart is evidenced across two distinct Node Host lifetimes in recovered receipt `/home/shizuku/Project/ohpichamber-omp-artifacts/m211-acceptance-receipt-recovered.json`, not an in-process Node restart in the composed scenario. Full application activation remains deferred to task 17 after UI callers move.

Review boundary: `56eecce630fcf2c1052971f01a868ab6819d5b30` through the integrated Task 22 Host/service consumer changes, including final private credential registration and archive/list projection. Requirements and quality pass; security pass, 0 remaining findings. The authored-lint prerequisite is fixed and checked; no reviewed semantic boundary changed afterward. The disposable driver was removed after retaining the passing receipt; final observed service PID 507093 was absent after graceful shutdown.
