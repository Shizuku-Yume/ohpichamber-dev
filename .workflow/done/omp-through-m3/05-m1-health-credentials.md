# 05: Add host health and explicit credential-handoff preflight

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** 1a59130b5a2bd56a9757122606093006b0cfaae1
**Base branch:** omp-through-m3/m1-integration
**Started:** 2026-10-12T09:07:08+00:00
**Finished:** 2026-10-12T14:39:12+00:00

**Delivers:** Host canonical health/capabilities and authenticated explicit user intent/provider-specific credential preflight. Absent real Agent Service is unavailable, not imported; actual SDK handoff acceptance remains task 22 before M2 gate 23.

**Blocked by:** 04
**Files:** `packages/web/server/index.js`, `packages/web/server/lib/host/`, `packages/web/server/lib/ui-auth/`, host route tests and documentation

**Read first:** `.workflow/specs/omp-through-m3.md` M1/W2; `contracts.md` health/errors and architecture credential boundary; existing auth route and server startup patterns; host module docs
**Covers:** W2

**Check:** `bun test packages/web/server/lib/host packages/web/server/lib/ui-auth` → authenticated health/capabilities omit secrets/absolute paths; explicit preflight distinguishes unsupported/re-auth-required/unavailable providers, refuses absent service without reading/staging secrets and never reports imported. Actual imported/write/read-reload outcomes are preserved in task 22, not waived.

- [x] Add host-owned health/readiness/capability composition with explicit unavailable agent state.
- [x] Keep external authentication and internal service authentication as separate checks.
- [x] Implement authenticated explicit user intent and only the provider-specific preflight fields verified by M0; no Node SDK AuthStorage writes or ad-hoc migration worker.
- [x] Return truthful unsupported/re-auth-required/unavailable preflight results. With service absent, do not fetch/stage credential secrets or claim imported; actual handoff belongs to task 22 and gate 23.
- [x] Ensure startup never scans/imports legacy credentials and preflight persists no secret staging records.

## Progress

Dirty at start: none in `/tmp/ohpi-m1-health-20261012`, branch `omp-through-m3/05-health-preflight`, stacked on archived task04. The original dirty main tree is not used for implementation. `M1HealthPreflight05` owns the isolated source slice; the coordinator owns gateway composition, integration and verification.

Check before: reuse task04's reviewed extraction and unchanged passing baseline receipts. Canonical routes and explicit credential preflight did not exist at this Base commit; no baseline suite or M0 probe was repeated.

Task05's 22 source/documentation paths are integrated once on the isolated integration branch after accepted task06 commit `247cdecdb`. The coordinator passed the existing `isRequestOriginAllowed` helper to bootstrap composition; no substitute service or SDK owner was introduced. The implementation preserves signed passwordless Web bootstrap, external/internal credential separation, strict explicit preflight, use-time enterprise policy and bounded canonical parser errors. Unknown canonical operations terminate before the legacy proxy.

Focused verification: `bun run test -- server/lib/ui-auth/canonical-host-routes.test.js server/lib/ui-auth/ui-auth.test.js server/lib/ui-auth/session-cookie.test.js server/lib/opencode/core-routes.test.js` from `packages/web` passed all four files and 61 tests in 1.30 seconds. `M1HealthQuality05` passed with zero findings, including the reserved index composition. The worker's zero-finding source-security review remains applicable. Scoped oxlint ran on the five changed JavaScript files and exited1 on 55 diagnostics; all 55 diagnostic source lines are unchanged from accepted baseline `247cdecdb`, with zero authored diagnostics. No rule was weakened and no baseline lint rerun was needed. Dead-code and documentation validation will run once with the metadata integration; independent requirements review and landing remain pending.

Actual full Node Host proof used private profiles and loopback listeners without an Agent Service or provider calls. The first run observed public health200, readiness503, passwordless signed-cookie bootstrap/capabilities200, unauthenticated canonical401 and malformed JSON400. The coordinator then exercised the remaining password-protected path: retained settings401 before login, internal-secret-only401, real password login/capabilities200, explicit valid preflight503 with unavailable/re-auth-required/unsupported descriptor outcomes, untrusted and opaque origins403, authenticated unknown canonical route503 and enterprise provider-entry403 applied at use time. The unavailable legacy loopback observer received zero credential/integration/auth calls. The completed coordinator run exited0 in 0.92 seconds; its HTTP listener, child processes, profile and script were cleaned. Secret staging absence also retains the focused test and static no-reader/no-writer ownership evidence, not an unobserved runtime claim.

Harness correction only: a retained legacy401 response is plain text, so the disposable request helper was corrected to parse JSON only for JSON content types. The original failed coordinator harness had already passed the same-port passwordless-token rejection assertion before reaching that response; the corrected run exercised only the remaining paths. No application source changed and no passing auth test or earlier status request was repeated. The separate verifier removed its three failed-attempt private profiles and confirmed its owned profile/script prefixes absent; no user or sibling roots were touched.

Independent requirements review `M1Requirements05` passed with no blocking findings. The two recorded limits remain unchanged: task22/gate23 must prove the real SDK credential handoff, and unavailable task30 platform evidence is not a pass. A general-purpose reviewer carried brief A because this harness has no `workflow-reviewer` role. Combined documentation validation passed for 696 pages and 58 sidebar links. Final export/dead-code verification and the shared gateway commit remain coordinated with task20; the completed preflight proof is not rerun.
