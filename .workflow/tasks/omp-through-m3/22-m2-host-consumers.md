# 22: Cut over server-owned execution consumers

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** 56eecce630fcf2c1052971f01a868ab6819d5b30
**Started:** 2026-10-13T12:12:54Z
**Status:** active

**Delivers:** Host execution consumers use the Canonical Agent Service, and authenticated explicit one-time credential handoff runs through the real Bun SDK owner with provider-specific results before M2 gate 23/final task 17 retirement.

**Blocked by:** 10, 12
**Files:** `packages/web/server/index.js`, `packages/web/server/lib/session-work/`, Host credential-handoff owner from task 05, Agent Service AuthStorage integration, permission/queue/routing/small-model/notification modules; focused tests and owner docs

**Read first:** `.workflow/specs/omp-through-m3.md` M2 host integration; contracts and architecture credential boundary; tasks 05/08/12/21; existing host composition and nearest owner documentation
**Covers:** W3, W4, W5, W6, W10

**Check:** Existing isolated runner on affected Host owners, then one disposable Host/real Agent Service scenario with OpenCode absent → queued follow-up dispatches once, approval blocks/resolves, canonical notification and independent FS/Git/PTY/Guest routes work. Explicit user-selected credential handoff proves SDK AuthStorage write/read-reload plus per-provider imported/unsupported/re-auth-required/unavailable outcomes, no secret-bearing response/log/staging and no automatic startup import. Missing required handoff evidence blocks gate 23/task 17, not a fake imported result. Record exact commands; remove temporary smoke code.

- [ ] Inventory all server-side execution consumers, including retained M4 features whose execution dependency must change now.
- [ ] Replace agent URLs, auth helpers and event consumers directly; do not preserve a dual execution authority.
- [ ] Preserve existing orchestration policy and Host authorization rather than redesigning M4 algorithms.
- [ ] Keep provider credentials inside the verified OMP-owned boundary, including quota access that previously read OpenCode credentials.
- [ ] Complete task-05 explicit intent/preflight with the real service: only after readiness/user intent obtain selected Host credential records or supported selected files, send privately to the Bun owner and perform verified SDK AuthStorage writes/read-reload; Node never loads/writes SDK AuthStorage.
- [ ] Preserve original one-time migration acceptance with provider-specific imported or explicit unsupported/re-authentication failure results. No secret staging, startup import, runtime fallback or invented conversion; service/provider absence is unavailable, not success. Complete this evidence before gate 23 and remove importer/legacy readers only in task 17.
- [ ] Test service unavailable and partial failure without converting them to empty authoritative success.
- [ ] Leave application activation to task 17 after all UI callers move; the disposable service run has no OpenCode fallback.

## Progress

Under `decisions.md: 2026-10-13 - Remove the M2 queue and consumer acceptance cycle`, task 11's committed `sqlite-store.js` and `canonical-runtime.js` Host SQLite queue owner and canonical dispatcher source in `/home/shizuku/Project/ohpichamber-worktrees/m1-integration` (`omp-through-m3/recovery-20261013`) are an available source prerequisite after tasks 10 and 12 complete their acceptance, without waiting for task 11's final composed acceptance first. All actual composed queue/attachment/context-receipt, explicit one-time credential handoff and Host authorization scenarios remain required before task 11 final verification and gate 23; runtime activation remains deferred to task 17.

Dirty at start: none.

Task 10 and task 12 are archived and landed. Work continues on `omp-through-m3/recovery-20261013`; parallel implementation uses separate task-22 worktrees, with the integration owner retaining shared startup, route composition and shutdown files. Task 11 remains paused for the composed acceptance required here.

Check before: the new composed Host/Agent Service scenario is not runnable yet. The current `host/canonical-routes.js` implements M1 preflight and explicit service-unavailable responses, not operational session dispatch or actual credential handoff. The accepted task-10/task-12 receipts cover private service behavior only; unchanged package checks and M1 scenarios are not repeated as a substitute.

Surfaces: Web/PWA and Electron use the authenticated Node Host boundary. Hosted mobile and Capacitor use that same remote Host; neither starts a local Agent Service. Guest actions remain Host capability-scoped and use the same canonical execution owner. This task prepares the composition; application activation remains task 17 after UI callers move.

Implementation slices: S1 owns Host policy/supervisor and trusted Bun input derivation; S2 owns authenticated canonical gateway, explicit selected credential handoff, quota and TTS credential access; S3 owns queue/session/permission/routing/small-model consumers; S4 owns canonical event fan-out and retained execution-dependent features, including the authorized Host-tool bridge. Existing orchestration algorithms remain unchanged. The integration owner composes these modules and runs affected checks once after integration.
