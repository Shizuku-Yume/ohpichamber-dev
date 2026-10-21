# 71: Authorize fork-created sessions before approval-policy load

**Effort:** omp-through-m3
**Task type:** bugfix
**Base commit:** <commit-sha>

**Delivers:** "Fork from this message" / branch-session succeeds: the child session created inside the Agent Service by `POST /internal/sessions/:id/fork` gets a Host-captured approval-policy scope, so `policyLoad` returns the child's policy instead of 503 `APPROVAL_POLICY_WRITE_FAILED`; the branched session opens, streams and records history normally.

**Blocked by:** None
**Files:** `packages/web/server/lib/host/agent-service-supervisor.js`, `packages/web/server/lib/openchamber-sessions/routes.js`, `packages/agent-service/src/sessions/registry.ts`, `packages/agent-service/src/index.ts`, `packages/agent-service/src/interaction/host-policy.ts`, focused tests (`agent-service-supervisor*.test.js`, `routes-native-*.test.js`, `registry-native.test.ts`, `host-policy` tests)

**Read first:** `.workflow/specs/omp-through-m3.md` W7, W9; the archived Task56 limitation paragraph recording the 503 on both fork routes; `packages/agent-service/src/sessions/registry.ts` `openResolved` policy load at 860-862 and `fork`; `packages/agent-service/src/index.ts` HostApprovalPolicies wiring at 18/30-31; `packages/agent-service/src/interaction/host-policy.ts` request/failure path at 50-83; `packages/web/server/lib/host/agent-service-supervisor.js` policy handling at 88-108 and proxied scope capture at 305-345; `packages/web/server/lib/openchamber-sessions/routes.js` fork at 180-187/450-457; `packages/web/server/lib/host/approval-policy-store.js`; approval/scope ownership in `.workflow/omp-migration/contracts.md`
**Covers:** W7, W9

**Change:**

- Register or derive the fork child's Host scope before the service calls `policyLoad`, so `approval.policy.list` and `approval.policy.commit` for a service-created fork child are authorized by the captured workspace/project/child session identity.
- Keep approval policies workspace- and session-scoped; no blanket or global allow, no policy copied from the source session, and no arbitrary session or cross-workspace lookup.
- Fail closed when the workspace or child scope cannot be established. Preserve the existing unauthorized response for a foreign workspace or mismatched captured scope.
- Do not change transcript rendering, fork ancestry/inheritance, or unforked session admission.

**Check:** The focused failing-then-passing regression proves a fork child's policy scope is registered or authorized before `policyLoad`, for both list and commit; the test fails at the Base commit and passes after the change. Run `bunx vitest run --root packages/web server/lib/host/agent-service-supervisor.approval-policy.test.js`, `bunx vitest run --root packages/web server/lib/openchamber-sessions/routes-native-controls.test.js`, and `bun test packages/agent-service/src/sessions/registry-native.test.ts --timeout 60000`. Then one real isolated Web run forks a message, opens the child session, streams and reloads its transcript, and observes no `APPROVAL_POLICY_WRITE_FAILED`; unforked session create/stream and cross-workspace refusal remain unchanged.

- [ ] Host captures or authorizes the fork child's approval-policy scope before the child worker starts and before `policyLoad`.
- [ ] Policy list/commit remains workspace- and session-scoped; no blanket/global allow and no source-session policy inheritance.
- [ ] Cross-workspace or foreign-session policy access and fork are still refused.
- [ ] Real Web fork opens, streams and reloads the child transcript without `APPROVAL_POLICY_WRITE_FAILED`.
- [ ] Unforked session flows and captured-scope unauthorized behavior are unchanged.
