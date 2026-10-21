# 71: Authorize fork-created sessions before approval-policy load

**Effort:** omp-through-m3
**Task type:** bugfix
**Base commit:** 4d99b9827a817ce563ebd461eabac8ce4398c763
**Started:** 2026-10-21T01:17:00Z
**Finished:** 2026-10-21T01:52:00Z

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

- [x] Host captures or authorizes the fork child's approval-policy scope before the child worker starts and before `policyLoad`.
- [x] Policy list/commit remains workspace- and session-scoped; no blanket/global allow and no source-session policy inheritance.
- [x] Cross-workspace or foreign-session policy access and fork are still refused.
- [x] Real Web fork opens, streams and reloads the child transcript without `APPROVAL_POLICY_WRITE_FAILED`.
- [x] Unforked session flows and captured-scope unauthorized behavior are unchanged.

## Progress

Dirty at start: `none`. Worktree created from clean `omp-through-m3/verified-integration-20261021` at `4d99b9827`; the integration worktree itself was not modified.

Root cause: `SessionRegistry.openResolved` always calls `policyLoad` before `workers.start`. For a `fork` child, `openResolved` ran inside the fork HTTP request, before the Host had ever seen the child identity, and the policy list request carried only `{sessionId, workspaceId}`. `handlePolicyMessage` looked up `scopes.get(childId)`, missed, and replied `approval.policy.failed` → the worker surfaced 503 `APPROVAL_POLICY_WRITE_FAILED`. Registering the child after the fork response (what `routes.js` already does for Host metadata) is too late, because the load happens during the request.

Check before: the new `agent-service-supervisor.approval-policy.test.js` failed at the Base commit: `2 failed | 3 passed`. The primary failure showed the in-flight child list reply as `{type:"approval.policy.failed", code:"APPROVAL_POLICY_WRITE_FAILED"}` instead of `approval.policy.listed`; the other failure was the new uncaptured-fork refusal assertion. `bunx vitest run --root packages/web server/lib/host/agent-service-supervisor.approval-policy.test.js`.

Change:
- `registry.fork` passes the source session id into `openResolved`, and only the fork open includes `forkOf` in `approval.policy.list`. Reopening an existing child still loads policies by its own captured identity.
- The Supervisor keeps a short-lived ticket per in-flight `POST /internal/sessions/:id/fork`, created only when the source already has a captured bootstrap scope and the body names that source. It injects the ticket's opaque id into the private fork body; a child `approval.policy.list` claiming `forkOf` plus that `forkTicketId` derives its scope as the frozen source scope with `rootSessionId` replaced by the child id. The id correlation keeps overlapping forks of one source on their own ticket regardless of arrival order. It never changes workspace/project/cwd/agent directory, refuses a child id that is already captured or equals the source, and accepts one child per ticket.
- On a non-2xx response, a mismatched acknowledgement, a lost response or any later request failure, the ticket and the derived child scope are removed. On success the child scope survives as its own captured scope; after the response, a fallback registration uses the acknowledged child identity.
- `HostApprovalPolicyListRequestSchema` and the shared `HostSessionForkAckSchema` in the private protocol validate the claimed identity and the acknowledgement (non-empty session/root/source ids, matching mode/entry shape); `ApprovalPolicyLoad`'s request type derives from the former. No global fallback, no policy copy from the source, and commits for an unknown session still fail.
- `packages/web/server/lib/host/DOCUMENTATION.md` records the fork ticket rule.

Check after:
- `bunx vitest run --root packages/web server/lib/host/agent-service-supervisor.approval-policy.test.js` → **6 pass / 0 fail** (in-flight list + commit authorized with the child/root/project/workspace identity, no-ticket refusal, foreign-workspace refusal, uncaptured-parent refusal, mismatched-ack rollback + malformed-ack schema refusal, captured non-fork behavior preserved, and two overlapping forks of one source settling in reverse order with both children keeping their own scope).
- `bunx vitest run --root packages/web server/lib/openchamber-sessions/routes-native-controls.test.js` → **8 pass / 0 fail**, including the fork route test: reopen source → native entry → fork → child open, child registered once (`registrations: ["forked-child"]`).
- `bun test packages/agent-service/src/sessions/registry-native.test.ts --timeout 90000` → **15 pass / 0 fail / 135 expect() calls** (86.89 s on an idle machine, after the ticket-id refinement; an earlier concurrent run with a 209 s type-check contended on the 30 s worker startup and was discarded). The new case proves the child `policyLoad` receives `{sessionId: child, workspaceId: source, forkOf: source, forkTicketId: ticket}` with `workerStarted: false`, before the worker exists.
- `bun test packages/agent-service/src/interaction` → **11 pass / 0 fail / 57 expect() calls**.
- `bun run --cwd packages/agent-service type-check` → exit 0 (`prepare-sdk-types` 13 packages, `tsc`, 209.72 s). `bun run --cwd packages/web type-check` → exit 0 (`tsc -b`, 3.17 s incremental). `bun run --cwd packages/web build` → exit 0 (Vite production, 80.33 s, dist `index.html` SHA-256 `ce94191ae8ea5632e72e83a2976b727010c75a7958eda384004e3e08a2382a68`).

Real isolated Web run (2026-10-21, loopback only, no external provider):
- Host `127.0.0.1:3179` from this worktree, isolated `HOME=/tmp/ohpi-task71/home`, `OPENCHAMBER_DATA_DIR=/tmp/ohpi-task71/data`, `OPENCHAMBER_CHATS_DIR=/tmp/ohpi-task71/chats`, UI password, managed-chat workspace `/tmp/ohpi-task71/chats/work` admitted with `POST /api/agent/v1/workspaces/resolve` (200, `ws_44923814…`, `pro_ba6a01d3…`). Local fixture provider `scripts/perf/fixture-provider.mjs` on `127.0.0.1:4601`, native provider `m3fixture/stream-300cps`; internet providers unused.
- Parent `bd7c4d9f-ec07-4c75-965e-ae4accfe037b` created (200), prompt streamed to completion (live assistant text grew across 5 distinct samples to the 5,742-char persisted reply; 2 persisted messages).
- `POST /api/agent/v1/sessions/bd7c4d9f…/fork` with `{messageId: "a70f870b…", mode:"selected"}` → **200** (no 503), child `01a15c25-5bf2-7723-b1ca-246d61d90858`. The second proxy `POST /api/openchamber/sessions/bd7c4d9f…/fork` also → **200** (child `01a15c25-c9d8-76fa-aebf-03141f5e8102`). The Host approval-policy SQLite store was active for this run, so each fork's `approval.policy.list` was authorized by the new child scope.
- Child opened (200, idle), inherited the source prefix (same user identity, same role/text; the branched assistant entry gets a derived `message:` identity), streamed its own prompt to completion (44 growth samples, persisted 11,484 chars across 4 messages), then `GET /api/openchamber/sessions/<child>` + history again returned the identical child message ids (`message:95ae4bbe…`, `8680add7…`, `b7d63a14…`) — reload is its own transcript.
- Parent history after the fork is identical in message ids to before (`ac9cea7d…`, `a70f870b…`) and contains no child prompt, so the parent is unaffected. No `APPROVAL_POLICY_WRITE_FAILED` and no HTTP 503 appears in the Host log or output.
- Receipt: `/home/shizuku/Project/ohpichamber-omp-artifacts/task71-fork-approval-2026-10-21.json`. Services stopped; ports 3179/4601 closed; no leftover Host/fixture processes.

Lint: `bunx oxlint` on every changed file. New files are clean. The changed existing files keep exactly their Base pre-existing findings and add none: `registry.ts` 11 (offsets 64, 254, 329, 353×2, 389, 483–486, 685 — the touched 860 line is clean), `manager.ts` 2 (163, 169), `agent-service-supervisor.js` 3 (90, 130, 138), `registry-native.test.ts` 1 (368).

Scope notes: `packages/agent-service/src/index.ts`, `interaction/host-policy.ts` and `openchamber-sessions/routes.js` needed no source change — the wiring already passed the policy request through unchanged, and routes already reopen the source before forking and register the returned child for Host metadata. Fork ancestry, transcript projection and unforked admission are untouched.

Review boundary: comparison point `4d99b9827a817ce563ebd461eabac8ce4398c763`; paths `packages/web/server/lib/host/{agent-service-supervisor.js,agent-service-supervisor.approval-policy.test.js,DOCUMENTATION.md}`, `packages/web/server/lib/openchamber-sessions/routes-native-controls.test.js`, `packages/agent-service/src/{sessions/registry.ts,sessions/registry-native.test.ts,interaction/manager.ts,supervisor/host-authorization-protocol.ts,supervisor/service.ts}`. Deliverable: a fork child's approval-policy list/commit is authorized from the Host-captured source scope before `policyLoad`/`workers.start`. Trust boundary: Authenticated Agent Service IPC → Node Host Gatekeeper scope map and `host-approval-policies.sqlite`.

Brief A (built as asked, process): **pass**, no blocking findings. It independently recreated the Base failure in `/tmp/t71base` from `4d99b9827` plus the new test (`2 failed | 3 passed`, same `APPROVAL_POLICY_WRITE_FAILED` reply) and judged the evidence real. Two nonblocking findings, both addressed: (a) overlapping forks of one source could cross-claim tickets by array order — fixed by the Host-issued `forkTicketId` echoed through the private fork body and a reverse-settlement concurrency regression; (b) the service-claimed child id is trusted for the in-flight window — recorded as the bounded trust assumption in `packages/web/server/lib/host/DOCUMENTATION.md`.

Brief B (quality): **pass**, no blocking findings. It traced non-JSON bodies, fetch throws, stop/child-exit races, non-fork `open` callers (reopen, restore, live reopen, restart, idle restart, relocation), and store scoping. Three nonblocking findings, two addressed: (a) the order-based ticket race above (fixed); (b) the acknowledgement was not schema-validated, so a 2xx body with missing ids could insert an `undefined` scope — fixed by the shared strict `HostSessionForkAckSchema`; (c) the list-request shape had several owners — reduced to one by deriving `ApprovalPolicyLoad`'s request from `HostApprovalPolicyListRequestSchema`. Its remaining observation (a hung fork request retains its ticket until service stop) is accepted as nonblocking: the supervisor's request path has no deadline for any private call, the state is not client-triggerable beyond an outstanding request, and the derived scope never exceeds the captured source.

Security pass (CONVENTIONS §7, independent `security-reviewer`): **pass**, no blocking findings. It verified no workspace/project/cwd/agentDirectory widening or session rebinding, per-request ticket correlation including out-of-order settlement, fail-closed on stale child/store/foreign scope/malformed request, no commit for an unknown session, rollback identity checks, no source-session policy inheritance, and strict-schema rejection of extra keys or non-string ids. Its one nonblocking finding — no timeout/TTL on an in-flight fork ticket — is accepted for the reason above and would be addressed by a private-request deadline owner, not this task.
