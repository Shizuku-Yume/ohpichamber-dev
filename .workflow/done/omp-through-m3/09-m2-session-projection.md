# 09: Implement session lifecycle and event projection

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** d42771226148aa6a06827cc7e2c8ce9403e2045f
**Base branch:** omp-through-m3/m1-integration
**Started:** 2026-10-12T18:11:47+00:00
**Finished:** 2026-10-12T20:35:27+00:00

**Delivers:** The Agent Service creates/resumes sessions, starts OMP turns, projects authoritative messages and status into Canonical DTOs, and supports bounded replay after reconnect. Archive state stays with the existing Host SQLite owner and is composed at task22, not copied into the Agent Service.

**Blocked by:** 08
**Files:** `packages/agent-service/src/sessions/`, `packages/agent-service/src/projection/`, contract fixtures and service tests

**Read first:** `.workflow/specs/omp-through-m3.md` M2/W3/W8; contracts session/event/cursor sections; OMP AgentSession and event APIs; sync-state invariants skill; architecture persistence boundary
**Covers:** W3, W8

**Check:** `bun test packages/agent-service/src/sessions packages/agent-service/src/projection` plus one temporary service session scenario → create/resume/turn/terminal/reconnect produces ordered events, snapshot plus cursor, explicit gap/reset behavior and no fabricated completion on fetch failure. Record the command and remove temporary smoke code.

- [x] Keep persisted session identity and live activity distinct.
- [x] Map OMP lifecycle/message events into stable service events with terminal/error states.
- [x] Persist or reconstruct the minimum cursor/replay state required by the contract.
- [x] Make reconnect behavior explicit for stale/invalid cursors and worker restart.
- [x] Preserve partial output and unrelated sessions when one turn fails.

## Progress

Dirty at start: none after task08 landed as `d42771226148aa6a06827cc7e2c8ce9403e2045f` on the isolated integration branch; original dirty main is untouched. Check before: runtime session routes, worker prompt/event IPC and projection/replay owners do not exist, so the task09 Check cannot run yet. Requirements and quality/security reviews for task08 are closed; no completed lifecycle/SDK probe is repeated.

Surfaces: Web/PWA and Electron consume the same Host-mediated canonical service; Electron retains its in-process Node Host and separate Bun worker boundary. Hosted mobile and Capacitor use their remote Host without local Agent/Guest service processes. Guest stays Host-capability-scoped. VS Code remains retired. Production activation stays task22/task17.

Authority: SDK transcript and history stay worker-owned; service owns live runtime DTOs and generation/cursor/replay, not Host metadata, archive records, queue or idempotency persistence. Replay retains the contract's newest 1,000 events per session with numeric uint64 sequence strings, atomic snapshot handoff and explicit 400/410/control-frame recovery. Event updates operate on the addressed session/part, not workspace-wide scans; no speculative cache, background polling or automatic restart is introduced.

Check after: `bun test packages/agent-service/src/sessions packages/agent-service/src/projection` passed 7 tests after the reference and schema corrections (33 assertions, 74 ms). The final affected `bun test src/projection/journal.test.ts` passed 4 tests/23 assertions in 73 ms after branch-version projection changed. Cached strict SDK declarations were reused: `bunx tsc -p node_modules/.cache/omp-types/tsconfig.json` and `bunx oxlint src` passed; unchanged SDK declaration generation and completed M0/M1/task07/task08 scenarios were not repeated.

Real path: `bun run --cwd packages/agent-service build && node scripts/.m209-acceptance.mjs` passed in 13,568 ms through the actual Node supervisor, built Bun service and installed pinned public SDK against the approved operator provider. It covered harmless tool execution with multiple native cycles in one run, live/history IDs, abort without fabricated completion, SSE replay, cold full-service restart/reopen with stable IDs, 410/400 cursor refusal and native deletion/404. Receipt: `/tmp/ohpi-m209-acceptance-receipt.json`.

The only missing runtime slice then used `bun --no-env-file packages/agent-service/scripts/.m209-setup.ts /tmp/ohpi-m209-failure-20261013 && bun run --cwd packages/agent-service build && node scripts/.m209-failure.mjs`, passing in 9,515 ms. The real SDK consumed a loopback partial stream followed by structured 401; the journal retained partial text, failed the run without completion and kept contiguous event sequences. An independent same-workspace root then completed against the approved real provider. The controlled provider received one request. Receipt: `/tmp/ohpi-m209-failure-receipt.json`. Both scenarios stopped the supervisor; all three temporary script files and owned private runtime roots were removed after proof. The operator's source configuration was not changed.

Observed integration corrections: normal pinned SDK terminal `agent_end` also sets `yielded: true`, so completion uses `isTerminal`/`awaitingAsyncWork`; optional SDK tool-result fields must cross the JSON boundary before canonical parsing. Worker subscriptions now stop the affected root on projection/persistence failure instead of letting SDK listener exception handling hide a missing event. No retry, provider fallback, additional cache or speculative defensive test was added.

Dead-code inspection found newly unused internal exports and missing Bun test entrypoints. The exports were made private or removed and existing tests were registered in `knip.json`. Cached strict type-check and `bunx knip@5.80.0 --workspace packages/agent-service --include files,exports,nsExports,types,nsTypes,enumMembers,duplicates` then passed. Remaining inherited UI findings and the not-yet-activated Host supervisor belong outside task09. The unrelated `packages/web/server/lib/opencode/shutdown-runtime.test.js` worktree change is preserved and excluded from this commit.

Requirements review found two blocking recovery defects: completed/failed native tool calls reconstructed as running, and an outer failed/cancelled run overwrote earlier completed model cycles. Both are fixed. History now matches native tool results, and native custom lifecycle entries preserve each turn's status and times without copying content. Two real `SessionManager` close/reopen regressions failed before and passed after (2 tests, 8 assertions, 283 ms); strict type-check, authored oxlint and build passed for the delta.

The affected runtime alone was exercised by `node scripts/.m209-recovery.mjs`: actual Node supervisor → built Bun service → installed public SDK → controlled two-cycle provider, with a real harmless bash call followed by partial output and 401. History retained terminal tool status and each cycle's live outcome/time; full service restart and reopen returned exactly the same turns/messages. Receipt `/tmp/ohpi-m209-recovery-receipt.json` passed in 6,395 ms with two fixture completion requests. Supervisor stopped; the throwaway script and its private root were removed. Prior successful session/failure-isolation scenarios were not repeated. Requirements and quality targeted rechecks passed; security review and its recovery-delta pass found no remaining in-scope findings. The final affected-workspace reachability check passed without output.
