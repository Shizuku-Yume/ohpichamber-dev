# 02: Todo history, settings and internal URLs

**Effort:** omp19-integration
**Blocked by:** 01
**Covers:** W2, W3
**Check:** `bun test src` in packages/agent-contract and `bun test src/worker --timeout 15000` in packages/agent-service → passes

- [x] Remove blocked from live todos and normalize historical blocked to pending.
- [x] Update settings placement and all locale labels.
- [x] Follow native local URL grammar without expanding authority.

## Progress

Web/PWA, Electron, hosted mobile and Capacitor share canonical todo/run behavior; Guest SDK and native process ownership remain unchanged.

Check after: agent-contract passed 271 tests, zero failures (`stage2-contract-tests.log`); the focused Agent Service mirror/policy/runtime run passed 206 tests, zero failures (`stage2-focused-final2.log`). Historical todo parser, TodoCard, TodoTray and local-log ReadToolGroup tests passed. Logs live under `/home/ubuntu/omp19-artifacts/logs/`.

The unversioned live todo shape follows OMP 19; documented read-boundary normalization preserves historical blocked snapshots, reminders and tool results. The settings mirror categorizes 477 native settings; force-removal labels/descriptions cover all 15 locales. Internal URL policy removes artifact, retains local log reads and preserves separate capability denials. No visual rendering check was performed.

Review: skipped — this environment has no reviewer-subagent tool; fresh workflow/security review remains for effort close.
