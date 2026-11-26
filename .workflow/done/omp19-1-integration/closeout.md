# Closeout: omp19-1-integration

**Accepted:** 2026-11-26 by the maintainer

## Shipped

- **W1:** the Agent Service, Docker and Electron stage the pinned OMP 19.1.0 closure from `vendor/omp/a7135b8f`. On `3d28b7ade6`, `prepare:agent-runtime` and `verify:agent-runtime` staged linux/x64 with Bun 1.4.5, 123 packages and readiness `{"ready":true,"ompVersion":"19.1.0"}`. The staging script refuses the workstation's default Bun 1.4.4. The same check passed again after the authorization fixes.
- **W2:** on the final commit `b3c03cafa8`, the Agent Service suite ran 845 tests: 819 pass, 26 skip, 0 fail. Root `bun run type-check` passed all five check steps. Agent Contract passed 287 tests, the effort's 15 UI test files 318 tests, and the Host authorizer 44.
- **W3:** five Agent Service files that run the real Canonical path on loopback passed 133/133: plan review, Host refusal of a Bash-mounted tool, both MCP protocol generations with tool publication, shell output, and Task-child and `/tan` Bash authorization. An isolated browser run against a real provider passed chat streaming, todos, Ask forms, Bash with approval, the subagent HUD and Stop. Evidence: `ohpichamber-omp-artifacts/omp19-close-2026-11-26/` (`realpath/REPORT.md`, `final/`).

## Key decisions & plan changes

- The internal URL read allowlist now follows the OMP 19.1 scheme set (decisions.md, 2026-11-26). The ten schemes 19.1 added stay refused.
- Effort-close review found Host authorization gaps on paths where the SDK builds its own sessions or mints credentials. The maintainer chose to fix them in the SDK patch with full coverage. Every SDK-built worker session now inherits Host authorization and fails closed without it (decisions.md, 2026-11-26). This covers `/cleanse`, `/tan`, Vibe, persisted revival, advisors, compaction and other auxiliary model calls, and mnemopi embeddings and remote LLM use. `task.workerThreads` is pinned to 0. The fix took nine review rounds; the final security and quality reviews had no findings.

## Waived checks & skipped reviews

Tasks 01 and 02 originally recorded `Review: skipped` because no reviewer could be spawned. At close, independent workflow and security reviews covered `19613812..18c430dc63` and current `main`. Their findings are fixed in `b3c03cafa8`, and the final round was clean. The original run receipts are not on this machine; the close reruns above replace them.

## Remaining debt & follow-ups

- technical-debt.md: "Advisor overflow compaction refusal has no behavioral test", "Image generation authorizes provider entry instead of provider use", "Exact slash-command matches need a second Enter".
- Not verified: Electron GUI, non-Linux platforms, live OAuth account rotation. `/handoff` was verified only as command dispatch; the browser session stayed below the 20k-token compaction floor.
